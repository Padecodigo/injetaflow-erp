import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  chaveIdempotencia, chaveNatural, identificadorRep, inconsistenciasCsv, inconsistenciasDaImportacao, parseAfd, planejarImportacao, relatorioImportacao,
  type DecisaoImportacao, type EstadoConhecido, type Lacuna, type OpcoesParser, type Quarentena, type Registro,
} from "../src";
import { assinaturaRepC, cabecalho, CNPJ_EMPREGADOR, CPF_A, CPF_B, linhasRepC, linhasRepP, montarAfd, tipo3, trailer } from "./fixtures/gerador";

/**
 * Integração do ponto-core sem banco: arquivo sintético em disco → parser → chave do REP → decisão do pipeline →
 * "gravação" num repositório em memória que imita as chaves únicas do plano (empresa, REP, NSR) → reimportação,
 * sobreposição, conflito e relatório. Mostra que o pacote entrega tudo que o caso de uso da F2 precisa, sem I/O próprio.
 */
const fixture = (nome: string) => readFileSync(join(import.meta.dirname, "fixtures", nome));

class RepositorioEmMemoria {
  private readonly linhas = new Map<string, { hash: string; bruta: string; instante: number | null }>();
  /** Por REP: cursor persistido (`decisao.novoUltimoNsr`) e lacunas ainda abertas (contrato da F2, README). */
  private readonly reps = new Map<string, { cursor: number | null; lacunas: Lacuna[] }>();
  /** Pendências para o RH (quarentena): guardadas, nunca como marcação válida. */
  readonly pendencias: Quarentena<Registro>[] = [];
  /** Contrato da F2 (README): cursor, primeiro NSR, hashes e instantes gravados, lacunas conhecidas. */
  estado(empresaId: string, repId: string): EstadoConhecido {
    const hashesPorNsr = new Map<number, string>();
    const instantesPorNsr = new Map<number, number>();
    let primeiroNsr: number | null = null;
    for (const [chave, v] of this.linhas) {
      const [e, r, nsrTexto] = chave.split("|");
      if (e !== encodeURIComponent(empresaId) || r !== encodeURIComponent(repId)) continue;
      const nsr = Number(nsrTexto);
      hashesPorNsr.set(nsr, v.hash);
      if (v.instante !== null) instantesPorNsr.set(nsr, v.instante);
      if (primeiroNsr === null || nsr < primeiroNsr) primeiroNsr = nsr;
    }
    const rep = this.reps.get(`${empresaId}|${repId}`);
    return { ultimoNsr: rep?.cursor ?? null, primeiroNsr, hashesPorNsr, instantesPorNsr, lacunasConhecidas: rep?.lacunas ?? [] };
  }
  gravar(empresaId: string, repId: string, decisao: DecisaoImportacao<Registro>) {
    for (const r of decisao.inserir) {
      const chave = chaveNatural({ empresaId, repId, nsr: r.nsr });
      if (this.linhas.has(chave)) throw new Error(`chave única violada: ${chave}`); // como a UNIQUE do banco
      this.linhas.set(chave, { hash: r.linhaHash, bruta: r.linhaBruta, instante: r.instante });
    }
    const k = `${empresaId}|${repId}`;
    const rep = this.reps.get(k) ?? { cursor: null, lacunas: [] };
    // lacunas abertas: as antigas menos o que foi preenchido, mais as novas
    const preenchidos = new Set(decisao.lacunasPreenchidas.map(x => x.nsr));
    const abertas: Lacuna[] = [];
    for (const l of [...rep.lacunas, ...decisao.lacunas]) {
      let de: number | null = null;
      for (let n = l.de; n <= l.ate + 1; n++) {
        const fechado = n > l.ate || preenchidos.has(n);
        if (!fechado && de === null) de = n;
        if (fechado && de !== null) {
          abertas.push({ de, ate: n - 1 });
          de = null;
        }
      }
    }
    this.reps.set(k, { cursor: decisao.novoUltimoNsr, lacunas: abertas });
  }
  bruta(empresaId: string, repId: string, nsr: number) {
    return this.linhas.get(chaveNatural({ empresaId, repId, nsr }))?.bruta;
  }
  get total() {
    return this.linhas.size;
  }
}

function importar(repo: RepositorioEmMemoria, empresaId: string, bytes: Uint8Array, opcoes: OpcoesParser = { empregadoresPermitidos: [CNPJ_EMPREGADOR] }) {
  const parse = parseAfd(bytes, opcoes);
  const repId = parse.cabecalho ? identificadorRep(parse.cabecalho, parse.tipoRep ?? "C") : "sem-cabecalho";
  const decisao = planejarImportacao(repo.estado(empresaId, repId), parse);
  repo.gravar(empresaId, repId, decisao);
  repo.pendencias.push(...decisao.quarentena);
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

  it("P8-01/P8-04: marcação com erro grave vai para pendência (nunca vira marcação) e arquivo de outra empresa é rejeitado inteiro", () => {
    const repo = new RepositorioEmMemoria();
    const base = linhasRepC();
    // NSR 6 com data e hora impossível (CRC recalculado): erro grave
    const comErro = base.map((l, i) => (i === 6 ? tipo3(6, "2026-02-30T25:61:00-0300", CPF_A) : l));
    const r = importar(repo, "empresa-a", montarAfd(comErro));
    expect(r.decisao.inserir.map(x => x.nsr)).not.toContain(6);
    expect(repo.bruta("empresa-a", r.repId, 6)).toBeUndefined();
    expect(repo.pendencias.map(p => [p.registro.nsr, p.motivos])).toEqual([[6, ["CAMPO_INVALIDO"]]]);
    expect(r.relatorio).toMatchObject({ status: "COM_ERROS", novas: 9, quarentena: 1 });

    const outra = importar(new RepositorioEmMemoria(), "empresa-a", montarAfd(base), { empregadoresPermitidos: ["99.888.777/0001-00"] });
    expect(outra.relatorio.status).toBe("REJEITADA");
    expect(outra.decisao.inserir).toEqual([]);
    expect(outra.decisao.quarentena).toHaveLength(10);
    expect(outra.decisao.quarentena[0].motivos).toEqual(["EMPREGADOR_FORA_DA_EMPRESA"]);
  });

  it("P8-R2-01/02/03: lacuna aberta, re-coleta coerente entra com aviso, forjada vai para pendência; cursor persistido", () => {
    const repo = new RepositorioEmMemoria();
    const empresa = "empresa-a";
    const lote = (nsrs: number[], dh: (n: number) => string, cpf = CPF_A) => montarAfd([cabecalho(), ...nsrs.map(n => tipo3(n, dh(n), cpf)), trailer({ "3": nsrs.length }), assinaturaRepC()]);
    const a = importar(repo, empresa, montarAfd(linhasRepC()));
    expect(a.decisao.novoUltimoNsr).toBe(10);
    const b = importar(repo, empresa, lote([15, 16], n => `2026-10-03T0${n - 10}:00:00-0300`));
    expect(b.decisao.lacunas).toEqual([{ de: 11, ate: 14 }]);
    expect(repo.estado(empresa, b.repId)).toMatchObject({ ultimoNsr: 16, primeiroNsr: 1, lacunasConhecidas: [{ de: 11, ate: 14 }] });

    // forjada: data de setembro no meio de outubro → pendência, nada gravado
    const forjada = importar(repo, empresa, lote([11], () => "2026-09-15T08:00:00-0300", CPF_B));
    expect(forjada.decisao.quarentena.map(q => q.motivos)).toEqual([["LACUNA_INCOERENTE"]]);
    expect(repo.bruta(empresa, b.repId, 11)).toBeUndefined();

    // re-coleta legítima de 11..14 (02/10, entre o NSR 10 e o 15) → entra, com aviso
    const reco = importar(repo, empresa, lote([11, 12, 13, 14], n => `2026-10-02T1${n - 11}:00:00-0300`));
    expect(reco.relatorio).toMatchObject({ status: "COM_AVISOS", novas: 4, lacunasPreenchidas: 4 });
    expect(repo.estado(empresa, b.repId)).toMatchObject({ ultimoNsr: 16, lacunasConhecidas: [] });

    // depois de fechada a lacuna, o mesmo NSR com outro conteúdo é conflito (nunca sobrescreve)
    const depois = importar(repo, empresa, lote([12], () => "2026-10-02T11:30:00-0300", CPF_B));
    expect(depois.decisao.conflitos).toHaveLength(1);
  });
});
