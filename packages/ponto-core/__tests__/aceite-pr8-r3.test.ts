import { describe, expect, it } from "vitest";
import {
  decidirImportacao, inconsistenciasDaImportacao, parseAfd, planejarImportacao, relatorioImportacao,
  type DecisaoImportacao, type EstadoConhecido, type Lacuna, type OpcoesParser, type Registro,
} from "../src";
import { assinaturaRepC, cabecalho, CPF_A, linhasRepC, montarAfd, tipo3, trailer } from "./fixtures/gerador";

/**
 * Regressões do aceite do PR #8, rodada 3 (relatorio-aceite-pr7-pr8-r3.md): P8-R3-01 (CRC de outro algoritmo no
 * REP-C não pode travar o cursor nem desligar as proteções da R2), P8-R3-02 (dois NSR corrompidos seguidos) e
 * P8-R3-06 (arrays e data e hora somente leitura). AFD 100% sintético.
 */
const parse = (linhas: string[], opcoes?: OpcoesParser) => parseAfd(montarAfd(linhas), opcoes);
const vazio: EstadoConhecido = { ultimoNsr: null, hashesPorNsr: new Map() };
/** CRC "de outro algoritmo": troca os 4 últimos caracteres por um valor que não é o KERMIT. */
const outroCrc = (l: string) => l.slice(0, -4) + (l.slice(-4) === "0000" ? "0001" : "0000");
const T0 = Date.parse("2026-10-01T03:00:00Z");
const dhMin = (m: number) => new Date(T0 + m * 60_000 - 3 * 3_600_000).toISOString().slice(0, 16) + ":00-0300";
/** REP-C inteiro com o CRC alternativo em TODAS as linhas (tipo 3, 1 minuto por NSR). */
const arquivoRepC = (nsrs: number[], dh: (n: number) => string = dhMin) =>
  [cabecalho({ dataFinal: "2027-12-31" }), ...nsrs.map(n => outroCrc(tipo3(n, dh(n), CPF_A))), trailer({ "3": nsrs.length }), assinaturaRepC()];
const faixa = (de: number, ate: number, sem: number[] = []) => Array.from({ length: ate - de + 1 }, (_, i) => de + i).filter(n => !sem.includes(n));

/** Simulador da F2 pelo contrato do README: cursor = novoUltimoNsr, hashes e instantes gravados, lacunas abertas. */
class F2 {
  hashes = new Map<number, string>();
  instantes = new Map<number, number>();
  cursor: number | null = null;
  lacunas: Lacuna[] = [];
  estado(): EstadoConhecido {
    let primeiroNsr: number | null = null;
    for (const n of this.hashes.keys()) if (primeiroNsr === null || n < primeiroNsr) primeiroNsr = n;
    return { ultimoNsr: this.cursor, primeiroNsr, hashesPorNsr: this.hashes, instantesPorNsr: this.instantes, lacunasConhecidas: this.lacunas };
  }
  gravar(d: DecisaoImportacao<Registro>) {
    for (const r of d.inserir) {
      this.hashes.set(r.nsr, r.linhaHash);
      if (r.instante !== null) this.instantes.set(r.nsr, r.instante);
    }
    const preenchidos = new Set(d.lacunasPreenchidas.map(x => x.nsr));
    this.lacunas = [...this.lacunas, ...d.lacunas].flatMap(l => faixa(l.de, l.ate).filter(n => !preenchidos.has(n)).map(n => ({ de: n, ate: n })));
    this.cursor = d.novoUltimoNsr;
  }
  importar(linhas: string[], opcoes?: OpcoesParser) {
    const p = parse(linhas, opcoes);
    const d = planejarImportacao(this.estado(), p);
    this.gravar(d);
    return { p, d, r: relatorioImportacao(p, d), inc: inconsistenciasDaImportacao(p, d) };
  }
}

describe("P8-R3-01: REP-C inteiro com CRC de outro algoritmo (INMETRO)", () => {
  it("o cursor avança normalmente e há aviso explícito CRC_NAO_VERIFICAVEL (nunca em silêncio)", () => {
    const f2 = new F2();
    const a = f2.importar(arquivoRepC(faixa(1, 50, [20])));
    expect(a.p.crcVerificavel).toBe(false);
    expect(a.p.inconsistencias.filter(i => i.codigo === "CRC_NAO_VERIFICAVEL")).toMatchObject([{ severidade: "aviso", mensagem: expect.stringMatching(/outro algoritmo/) }]);
    expect(a.p.inconsistencias.some(i => i.codigo === "NSR_FORA_DE_ORDEM")).toBe(false);
    expect(a.d).toMatchObject({ crcVerificavel: false, novoUltimoNsr: 50, lacunas: [{ de: 20, ate: 20 }] });
    expect(a.d.inserir).toHaveLength(49);
    expect(a.r.status).toBe("COM_AVISOS");
  });

  it("a proteção de lacuna continua valendo: NSR 20 forjado (25/12) → LACUNA_INCOERENTE; o legítimo entra com aviso", () => {
    const f2 = new F2();
    f2.importar(arquivoRepC(faixa(1, 50, [20])));
    const forjado = f2.importar(arquivoRepC([20], () => "2026-12-25T03:00:00-0300"));
    expect(forjado.d.inserir).toEqual([]);
    expect(forjado.d.quarentena.map(q => q.motivos)).toEqual([["LACUNA_INCOERENTE"]]);
    expect(forjado.r.status).toBe("COM_ERROS");
    const legitimo = f2.importar(arquivoRepC([20]));
    expect(legitimo.d.lacunasPreenchidas.map(x => x.nsr)).toEqual([20]);
    expect(legitimo.inc.some(i => i.codigo === "PREENCHIMENTO_DE_LACUNA")).toBe(true);
    expect(f2.lacunas).toEqual([]);
  });

  it("reset do REP (1..60 com outro conteúdo) fica BLOQUEADO por retrocesso", () => {
    const f2 = new F2();
    f2.importar(arquivoRepC(faixa(1, 50)));
    const reset = f2.importar(arquivoRepC(faixa(1, 60), n => dhMin(n + 5_000)));
    expect(reset.d.retrocesso).toEqual({ ultimoNsr: 50, primeiroNsrArquivo: 1, maiorNsrArquivo: 60 });
    expect(reset.d.inserir).toEqual([]);
    expect(reset.r.status).toBe("BLOQUEADA");
    expect(f2.cursor).toBe(50);
  });

  it("estado incompleto e NSR abaixo do primeiro continuam retidos", () => {
    const f2 = new F2();
    f2.importar(arquivoRepC(faixa(5, 50)));
    const p = parse(arquivoRepC(faixa(1, 10)));
    const semHash = planejarImportacao({ ...f2.estado(), hashesPorNsr: new Map([[5, f2.hashes.get(5)!]]) }, p);
    expect(semHash.quarentena.filter(q => q.motivos.includes("ESTADO_INCOMPLETO")).map(q => q.registro.nsr)).toEqual([6, 7, 8, 9, 10]);
    expect(semHash.quarentena.filter(q => q.motivos.includes("NSR_ABAIXO_DO_CURSOR")).map(q => q.registro.nsr)).toEqual([1, 2, 3, 4]);
    expect(semHash.inserir).toEqual([]);
  });

  it("salto: coleta contígua com cursor antigo segue avançando; NSR isolado muito acima vai para NSR_SALTO_ANOMALO", () => {
    const f2 = new F2();
    f2.importar(arquivoRepC(faixa(1, 10)));
    const grande = f2.importar(arquivoRepC(faixa(11, 10_100)));
    expect(grande.d.quarentena).toEqual([]);
    expect(f2.cursor).toBe(10_100);
    const isolado = f2.importar(arquivoRepC([10_101, 900_000_000]));
    expect(isolado.d.inserir.map(x => x.nsr)).toEqual([10_101]);
    expect(isolado.d.quarentena.map(q => [q.registro.nsr, q.motivos])).toEqual([[900_000_000, ["NSR_SALTO_ANOMALO"]]]);
    expect(f2.cursor).toBe(10_101);
  });

  it("decidirImportacao direto (sem planejarImportacao) deduz a mesma regra e o relatório avisa", () => {
    const p = parse(arquivoRepC(faixa(1, 5)));
    const d = decidirImportacao(vazio, p.registros);
    expect(d).toMatchObject({ crcVerificavel: false, novoUltimoNsr: 5 });
    // sem o aviso do parser (ex.: linhas montadas pela F2), o relatório da importação acrescenta o aviso
    const semAviso = { ...p, inconsistencias: p.inconsistencias.filter(i => i.codigo !== "CRC_NAO_VERIFICAVEL") };
    expect(inconsistenciasDaImportacao(semAviso, d).filter(i => i.codigo === "CRC_NAO_VERIFICAVEL")).toHaveLength(1);
  });

  it("com CRC KERMIT válido no arquivo, a regra da R2 continua: o registro com CRC inválido não avança o cursor", () => {
    const linhas = [cabecalho(), tipo3(1, dhMin(1), CPF_A), tipo3(2, dhMin(2), CPF_A), outroCrc(tipo3(3, dhMin(3), CPF_A)), trailer({ "3": 3 }), assinaturaRepC()];
    const p = parse(linhas, { crcVerificavel: true }); // arquivo pequeno: algoritmo do cadastro do REP (P8-R4-01)
    expect(p.crcVerificavel).toBe(true);
    expect(p.inconsistencias.some(i => i.codigo === "CRC_NAO_VERIFICAVEL")).toBe(false);
    expect(planejarImportacao(vazio, p).novoUltimoNsr).toBe(2);
  });

  it('crc: "ignorar" → crcVerificavel null, sem aviso, cursor avança', () => {
    const p = parse(arquivoRepC(faixa(1, 5)), { crc: "ignorar" });
    expect(p.crcVerificavel).toBeNull();
    expect(p.inconsistencias).toEqual([]);
    expect(planejarImportacao(vazio, p).novoUltimoNsr).toBe(5);
  });
});

describe("P8-R3-02: dois NSR corrompidos seguidos em REP-C (KERMIT válido nos demais)", () => {
  it("6 → 906 e 7 → 907 (CRC original): os dois vão para quarentena, sem lacuna falsa 21–905", () => {
    const base = Array.from({ length: 20 }, (_, i) => tipo3(i + 1, dhMin(i + 1), CPF_A));
    base[5] = "000000906" + base[5].slice(9);
    base[6] = "000000907" + base[6].slice(9);
    const p = parse([cabecalho(), ...base, trailer({ "3": 20 }), assinaturaRepC()]);
    expect(p.inconsistencias.filter(i => i.codigo === "NSR_FORA_DE_ORDEM").map(i => i.nsr)).toEqual([906, 907]);
    const d = planejarImportacao(vazio, p);
    expect(d.inserir.map(x => x.nsr)).toEqual(faixa(1, 20, [6, 7]));
    expect(d.quarentena.map(q => q.registro.nsr)).toEqual([906, 907]);
    expect(d.lacunas).toEqual([{ de: 6, ate: 7 }]);
    expect(d.novoUltimoNsr).toBe(20);
  });

  it("CRC inválido inserido (sem pico) não estende a análise de lacunas", () => {
    const linhas = [cabecalho(), tipo3(1, dhMin(1), CPF_A), tipo3(2, dhMin(2), CPF_A), outroCrc(tipo3(50, dhMin(3), CPF_A)), trailer({ "3": 3 }), assinaturaRepC()];
    const d = planejarImportacao(vazio, parse(linhas, { crcVerificavel: true }));
    expect(d.inserir.map(x => x.nsr)).toEqual([1, 2, 50]);
    expect(d.lacunas).toEqual([]);
    expect(d.novoUltimoNsr).toBe(2);
  });
});

describe("P8-R3-06: problemas, errosGraves e data e hora são somente leitura", () => {
  it("o tipo é readonly (erro de compilação para quem tentar mutar) e o array devolvido é congelado", () => {
    const [r] = parse(linhasRepC()).registros;
    // @ts-expect-error P8-R3-06: problemas é readonly CodigoInconsistencia[]
    expect(() => r.problemas.push("CRC_INVALIDO")).toThrow(TypeError);
    // @ts-expect-error P8-R3-06: errosGraves é readonly CodigoInconsistencia[]
    expect(() => r.errosGraves.push("CRC_INVALIDO")).toThrow(TypeError);
    const r3 = parse(linhasRepC()).registros.find(x => x.tipo === "3")!;
    if (r3.tipo !== "3" || !r3.marcadoEm) throw new Error("fixture");
    // @ts-expect-error P8-R3-06: DataHoraAfd tem campos readonly
    expect(() => { r3.marcadoEm!.utc = "x"; }).toThrow(TypeError);
  });
});
