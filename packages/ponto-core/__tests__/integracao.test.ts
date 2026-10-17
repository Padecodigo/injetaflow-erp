import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  chaveIdempotencia, chaveNatural, decidirImportacao, identificadorRep, inconsistenciasCsv, inconsistenciasDaImportacao, parseAfd, relatorioImportacao,
  type EstadoConhecido, type Registro,
} from "../src";
import { CPF_A, linhasRepC, linhasRepP, montarAfd, tipo3, trailer } from "./fixtures/gerador";

/**
 * Integração do ponto-core sem banco: arquivo sintético em disco → parser → chave do REP → decisão do pipeline →
 * "gravação" num repositório em memória que imita as chaves únicas do plano (empresa, REP, NSR) → reimportação,
 * sobreposição, conflito e relatório. Mostra que o pacote entrega tudo que o caso de uso da F2 precisa, sem I/O próprio.
 */
const fixture = (nome: string) => readFileSync(join(import.meta.dirname, "fixtures", nome));

class RepositorioEmMemoria {
  private readonly linhas = new Map<string, { hash: string; bruta: string }>();
  estado(empresaId: string, repId: string): EstadoConhecido {
    const hashesPorNsr = new Map<number, string>();
    for (const [chave, v] of this.linhas) {
      const [e, r, nsr] = chave.split("|");
      if (e === encodeURIComponent(empresaId) && r === encodeURIComponent(repId)) hashesPorNsr.set(Number(nsr), v.hash);
    }
    return { ultimoNsr: hashesPorNsr.size ? Math.max(...hashesPorNsr.keys()) : null, hashesPorNsr };
  }
  gravar(empresaId: string, repId: string, registros: Registro[]) {
    for (const r of registros) {
      const chave = chaveNatural({ empresaId, repId, nsr: r.nsr });
      if (this.linhas.has(chave)) throw new Error(`chave única violada: ${chave}`); // como a UNIQUE do banco
      this.linhas.set(chave, { hash: r.linhaHash, bruta: r.linhaBruta });
    }
  }
  bruta(empresaId: string, repId: string, nsr: number) {
    return this.linhas.get(chaveNatural({ empresaId, repId, nsr }))?.bruta;
  }
  get total() {
    return this.linhas.size;
  }
}

function importar(repo: RepositorioEmMemoria, empresaId: string, bytes: Uint8Array) {
  const parse = parseAfd(bytes);
  const repId = identificadorRep(parse.cabecalho!, parse.tipoRep ?? "C");
  const decisao = decidirImportacao(repo.estado(empresaId, repId), parse.registros);
  repo.gravar(empresaId, repId, decisao.inserir);
  return { parse, repId, decisao, relatorio: relatorioImportacao(parse, decisao) };
}

describe("integração ponto-core: arquivo → parser → pipeline → repositório em memória", () => {
  it("fixtures versionadas são idênticas ao gerador sintético (ISO 8859-1, CR LF)", () => {
    expect(new Uint8Array(fixture("afd-671-repc-sintetico.txt"))).toEqual(montarAfd(linhasRepC()));
    expect(new Uint8Array(fixture("afd-671-repp-sintetico.txt"))).toEqual(montarAfd(linhasRepP()));
  });

  it("importa, reimporta sem duplicar, importa só o delta e registra conflito sem sobrescrever", () => {
    const repo = new RepositorioEmMemoria();
    const empresa = "empresa-a";
    const bytes = fixture("afd-671-repc-sintetico.txt");

    const primeira = importar(repo, empresa, bytes);
    expect(primeira.relatorio).toMatchObject({ status: "OK", novas: 10, duplicadas: 0 });
    expect(repo.total).toBe(10);

    const segunda = importar(repo, empresa, bytes);
    expect(segunda.relatorio).toMatchObject({ status: "SEM_NOVIDADES", novas: 0, duplicadas: 10 });
    expect(segunda.relatorio.sha256Arquivo).toBe(primeira.relatorio.sha256Arquivo);
    expect(repo.total).toBe(10);

    // período maior: dois NSRs novos depois dos já importados
    const base = linhasRepC();
    const maior = [...base.slice(0, -2), tipo3(11, "2026-10-02T07:55:00-0300", CPF_A), tipo3(12, "2026-10-02T12:00:00-0300", CPF_A), trailer({ "2": 1, "3": 7, "4": 1, "5": 2, "6": 1 }), base.at(-1)!];
    const delta = importar(repo, empresa, montarAfd(maior));
    expect(delta.relatorio).toMatchObject({ status: "OK", novas: 2, duplicadas: 10 });
    expect(repo.total).toBe(12);

    // NSR 4 com conteúdo diferente: conflito, original intacto
    const original = repo.bruta(empresa, primeira.repId, 4);
    const adulterado = maior.map((l, i) => (i === 4 ? tipo3(4, "2026-10-01T06:00:00-0300", CPF_A) : l));
    const conflito = importar(repo, empresa, montarAfd(adulterado));
    expect(conflito.relatorio).toMatchObject({ status: "COM_ERROS", conflitos: 1, novas: 0 });
    expect(repo.bruta(empresa, primeira.repId, 4)).toBe(original);
    const csv = inconsistenciasCsv(inconsistenciasDaImportacao(conflito.parse, conflito.decisao));
    expect(csv).toContain("NSR_CONFLITO");
    expect(csv).not.toContain(CPF_A);
  });

  it("isolamento: o mesmo arquivo em duas empresas gera chaves distintas e não se mistura", () => {
    const repo = new RepositorioEmMemoria();
    const bytes = fixture("afd-671-repc-sintetico.txt");
    importar(repo, "empresa-a", bytes);
    const b = importar(repo, "empresa-b", bytes);
    expect(b.relatorio).toMatchObject({ novas: 10, duplicadas: 0 });
    expect(repo.total).toBe(20);
    const chavesA = new Set(b.parse.registros.map(r => chaveIdempotencia({ empresaId: "empresa-a", repId: b.repId, nsr: r.nsr, linhaHash: r.linhaHash })));
    const chavesB = new Set(b.parse.registros.map(r => chaveIdempotencia({ empresaId: "empresa-b", repId: b.repId, nsr: r.nsr, linhaHash: r.linhaHash })));
    expect([...chavesA].some(k => chavesB.has(k))).toBe(false);
  });

  it("REP-P: arquivo com cadeia íntegra, REP identificado pelo nº INPI", () => {
    const repo = new RepositorioEmMemoria();
    const r = importar(repo, "empresa-a", fixture("afd-671-repp-sintetico.txt"));
    expect(r.parse.tipoRep).toBe("P");
    expect(r.repId.startsWith("P:")).toBe(true);
    expect(r.relatorio).toMatchObject({ status: "OK", novas: 4, cadeiaHashInvalida: 0, nsrsEmLacuna: 0 });
  });
});
