import { describe, expect, it } from "vitest";
import {
  decidirImportacao, inconsistenciasDaImportacao, instanteSequencial, LIMITE_SALTO_NSR_PADRAO, parseAfd, planejarImportacao, relatorioImportacao,
  TOLERANCIA_LACUNA_MS_PADRAO, type EstadoConhecido, type Lacuna, type OpcoesParser, type Registro,
} from "../src";
import { crc16KermitHex } from "../src/crc16";
import { assinaturaRepC, cabecalho, CNPJ_EMPREGADOR, CPF_A, CPF_B, CPF_RESP, gerarCnpj, linhasRepC, montarAfd, num, pad, tipo2, tipo3, tipo7, trailer } from "./fixtures/gerador";

/**
 * Regressões do aceite do PR #8, rodada 2 (relatorio-aceite-pr7-pr8-r2.md, P8-R2-01 a P8-R2-04), com AFD 100%
 * sintético. Reproduz as sondas `novos-r2.mts` do cliente e confere o comportamento corrigido.
 */
const parse = (linhas: string[], opcoes?: OpcoesParser) => parseAfd(montarAfd(linhas), opcoes);
const comCrc = (c: string) => c + crc16KermitHex(c);
const vazio: EstadoConhecido = { ultimoNsr: null, hashesPorNsr: new Map() };
const ms = (dh: string) => Date.parse(dh.replace(/(\d{2})(\d{2})$/, "$1:$2"));

/** Estado completo pelo contrato da F2: hashes, instantes, cursor, primeiro NSR e lacunas conhecidas. */
function estadoDe(registros: readonly Registro[], lacunasConhecidas: Lacuna[] = []): EstadoConhecido {
  const hashesPorNsr = new Map<number, string>();
  const instantesPorNsr = new Map<number, number>();
  let primeiroNsr: number | null = null;
  let ultimoNsr: number | null = null;
  for (const r of registros) {
    hashesPorNsr.set(r.nsr, r.linhaHash);
    if (r.instante !== null) instantesPorNsr.set(r.nsr, r.instante);
    if (primeiroNsr === null || r.nsr < primeiroNsr) primeiroNsr = r.nsr;
    if (ultimoNsr === null || r.nsr > ultimoNsr) ultimoNsr = r.nsr;
  }
  return { ultimoNsr, primeiroNsr, hashesPorNsr, instantesPorNsr, lacunasConhecidas };
}

// Estado das sondas do cliente: NSR 1..10 (linhasRepC) e 15..20 gravados, lacuna 11..14 conhecida.
const base = linhasRepC();
const lote2 = [cabecalho(), ...[15, 16, 17, 18, 19, 20].map(n => tipo3(n, `2026-10-03T0${n % 10}:00:00-0300`, CPF_A)), trailer({ "3": 6 }), assinaturaRepC()];
const gravados = [...parse(base).registros, ...parse(lote2).registros];
const estado = estadoDe(gravados, [{ de: 11, ate: 14 }]);

describe("P8-R2-01: preenchimento de lacuna só com data e hora coerente com os vizinhos gravados", () => {
  it("arquivo forjado 11..14 com datas incoerentes (vizinhos: NSR 10 em 02/10 05:00, NSR 15 em 03/10 05:00) → quarentena LACUNA_INCOERENTE", () => {
    const forj = [cabecalho(), tipo3(11, "2026-09-01T03:00:00-0300", CPF_B), tipo3(12, "2026-10-31T23:59:00-0300", CPF_B), tipo3(13, "2026-10-01T08:00:00-0300", CPF_B), tipo3(14, "2026-10-01T08:01:00-0300", CPF_B), trailer({ "3": 4 }), assinaturaRepC()];
    const p = parse(forj);
    const d = planejarImportacao(estado, p);
    expect(d.inserir).toEqual([]);
    expect(d.quarentena.map(q => [q.registro.nsr, q.motivos])).toEqual([[11, ["LACUNA_INCOERENTE"]], [12, ["LACUNA_INCOERENTE"]], [13, ["LACUNA_INCOERENTE"]], [14, ["LACUNA_INCOERENTE"]]]);
    expect(relatorioImportacao(p, d).status).toBe("COM_ERROS");
    expect(inconsistenciasDaImportacao(p, d).filter(i => i.codigo === "LACUNA_INCOERENTE")).toHaveLength(4);
  });

  it("arquivo sobreposto 1..20 com 11..14 coerentes: entram, mas com aviso PREENCHIMENTO_DE_LACUNA e status nunca OK", () => {
    const linhas = [cabecalho(), ...base.slice(1, 11), ...[0, 1, 2, 3].map(i => tipo3(11 + i, `2026-10-02T1${i}:00:00-0300`, CPF_B)), ...lote2.slice(1, 7), trailer({ "2": 1, "3": 15, "4": 1, "5": 2, "6": 1 }), assinaturaRepC()];
    const p = parse(linhas);
    expect(p.inconsistencias).toEqual([]);
    const d = planejarImportacao(estado, p);
    expect(d.inserir.map(x => x.nsr)).toEqual([11, 12, 13, 14]);
    expect(d.lacunasPreenchidas.map(x => x.nsr)).toEqual([11, 12, 13, 14]);
    const r = relatorioImportacao(p, d);
    expect(r).toMatchObject({ status: "COM_AVISOS", novas: 4, lacunasPreenchidas: 4, duplicadas: 16 });
    expect(inconsistenciasDaImportacao(p, d).filter(i => i.codigo === "PREENCHIMENTO_DE_LACUNA")).toMatchObject([{ severidade: "aviso", nsr: 11, mensagem: expect.stringMatching(/NSRs 11 a 14 preencheram uma lacuna/) }]);
  });

  it("dentro do próprio arquivo, preenchimento que volta no tempo em relação ao anterior da mesma lacuna → LACUNA_INCOERENTE", () => {
    const linhas = [cabecalho(), tipo3(11, "2026-10-02T12:00:00-0300", CPF_B), tipo3(12, "2026-10-02T08:00:00-0300", CPF_B), trailer({ "3": 2 }), assinaturaRepC()];
    const d = planejarImportacao(estado, parse(linhas));
    expect(d.inserir.map(x => x.nsr)).toEqual([11]);
    expect(d.quarentena.map(q => [q.registro.nsr, q.motivos])).toEqual([[12, ["LACUNA_INCOERENTE"]]]);
  });

  it("tolerância documentada (padrão 10 min) e configurável", () => {
    expect(TOLERANCIA_LACUNA_MS_PADRAO).toBe(600_000);
    const t10 = ms("2026-10-02T05:00:00-0300"); // instante do NSR 10 (tipo 6 da fixture)
    expect(estado.instantesPorNsr instanceof Map && estado.instantesPorNsr.get(10)).toBe(t10);
    const dentro = [cabecalho(), tipo3(11, "2026-10-02T04:51:00-0300", CPF_B), trailer({ "3": 1 }), assinaturaRepC()];
    const fora = [cabecalho(), tipo3(11, "2026-10-02T04:49:00-0300", CPF_B), trailer({ "3": 1 }), assinaturaRepC()];
    expect(planejarImportacao(estado, parse(dentro)).inserir.map(x => x.nsr)).toEqual([11]);
    expect(planejarImportacao(estado, parse(fora)).quarentena.map(q => q.motivos)).toEqual([["LACUNA_INCOERENTE"]]);
    expect(planejarImportacao(estado, parse(dentro), { toleranciaLacunaMs: 0 }).quarentena.map(q => q.motivos)).toEqual([["LACUNA_INCOERENTE"]]);
  });

  it("sem o instante de um vizinho da lacuna no estado → ESTADO_INCOMPLETO (não dá para verificar)", () => {
    const semInstantes: EstadoConhecido = { ...estado, instantesPorNsr: new Map([[10, ms("2026-10-02T05:00:00-0300")]]) };
    const d = planejarImportacao(semInstantes, parse([cabecalho(), tipo3(11, "2026-10-02T10:00:00-0300", CPF_B), trailer({ "3": 1 }), assinaturaRepC()]));
    expect(d.inserir).toEqual([]);
    expect(d.quarentena.map(q => q.motivos)).toEqual([["ESTADO_INCOMPLETO"]]);
  });

  it("instanteSequencial: tipo 3 marcação, tipo 7 gravação (o NSR segue a gravação, inclusive offline), fuso respeitado", () => {
    const [r3] = parse([cabecalho(), tipo3(1, "2026-10-01T18:00:00-0200", CPF_A), trailer({ "3": 1 }), assinaturaRepC()]).registros;
    expect(instanteSequencial(r3)).toBe(ms("2026-10-01T17:00:00-0300"));
    const t7 = tipo7(1, { dh: "2026-10-01T08:00:00-0300", gravado: "2026-10-01T09:30:00-0300", cpf: CPF_A, offline: "1" });
    const [r7] = parse([cabecalho({ numeroRep: "5120220000001", modelo: "" }), t7.linha, trailer({ "7": 1 }), pad("ASSINATURA_DIGITAL_EM_ARQUIVO_P7S", 100)]).registros;
    expect(r7.instante).toBe(ms("2026-10-01T09:30:00-0300"));
  });
});

describe("P8-R2-02: NSR corrompido não envenena o cursor nem derruba o vizinho legítimo", () => {
  it("REP-C, NSR 6 → 900000006 com o CRC original: só o corrompido vai para quarentena; o 7 entra; cursor = 10; lacuna só 6–6", () => {
    const l = [...base];
    l[6] = "9" + l[6].slice(1);
    const p = parse(l);
    expect(p.inconsistencias.filter(i => i.codigo === "NSR_FORA_DE_ORDEM").map(i => i.nsr)).toEqual([900000006]);
    const d = decidirImportacao(vazio, p.registros);
    expect(d.inserir.map(x => x.nsr)).toEqual([1, 2, 3, 4, 5, 7, 8, 9, 10]);
    expect(d.quarentena.map(q => [q.registro.nsr, q.motivos])).toEqual([[900000006, expect.arrayContaining(["NSR_FORA_DE_ORDEM", "NSR_SALTO_ANOMALO"])]]);
    expect(d.lacunas).toEqual([{ de: 6, ate: 6 }]);
    expect(d.novoUltimoNsr).toBe(10);

    // coleta seguinte com o cursor persistido: segue normal, e a lacuna 6 continua conhecida
    const proximo = estadoDe(d.inserir, d.lacunas);
    const prox = parse([cabecalho(), tipo3(11, "2026-10-02T08:00:00-0300", CPF_A), tipo3(13, "2026-10-02T12:00:00-0300", CPF_A), trailer({ "3": 2 }), assinaturaRepC()]);
    const dd = decidirImportacao(proximo, prox.registros);
    expect(dd.inserir.map(x => x.nsr)).toEqual([11, 13]);
    expect(dd.lacunas).toEqual([{ de: 12, ate: 12 }]);
    expect(dd.lacunasPreenchidas).toEqual([]);
  });

  it("corrompido na última linha (sem vizinho seguinte): o salto manda para quarentena e o cursor não avança", () => {
    const l = [...base.slice(0, 9), "9" + base[9].slice(1), base[11], base[12]]; // 1..8 e o NSR 9 (tipo 3) → 900000009 por último
    const p = parse(l);
    expect(p.inconsistencias.some(i => i.codigo === "NSR_FORA_DE_ORDEM")).toBe(false); // não há seguinte para comparar
    const d = decidirImportacao(estadoDe(parse(base).registros.filter(r => r.nsr <= 5)), p.registros);
    expect(d.inserir.map(x => x.nsr)).toEqual([6, 7, 8]);
    expect(d.quarentena.map(q => [q.registro.nsr, q.motivos])).toEqual([[900000009, expect.arrayContaining(["NSR_SALTO_ANOMALO"])]]);
    expect(d.novoUltimoNsr).toBe(8);
    expect(d.lacunas).toEqual([]); // nenhuma lacuna falsa até 900 milhões
  });

  it("registro com CRC inválido em REP-C (aviso) pode entrar, mas nunca conta como último NSR", () => {
    const l3 = tipo3(3, "2026-10-01T09:00:00-0300", CPF_A);
    const ruim = l3.slice(0, -4) + (l3.slice(-4) === "0000" ? "1111" : "0000");
    const p = parse([cabecalho(), tipo3(1, "2026-10-01T07:00:00-0300", CPF_A), tipo3(2, "2026-10-01T08:00:00-0300", CPF_A), ruim, trailer({ "3": 3 }), assinaturaRepC()]);
    expect(p.inconsistencias).toMatchObject([{ codigo: "CRC_INVALIDO", severidade: "aviso", nsr: 3 }]);
    const d = planejarImportacao(vazio, p);
    expect(d.inserir.map(x => x.nsr)).toEqual([1, 2, 3]);
    expect(d.novoUltimoNsr).toBe(2);
    // com estado prévio, idem: o cursor fica no último NSR confiável
    expect(planejarImportacao({ ultimoNsr: 0, hashesPorNsr: new Map() }, p).novoUltimoNsr).toBe(2);
  });

  it("limite de salto: padrão 10.000, configurável", () => {
    expect(LIMITE_SALTO_NSR_PADRAO).toBe(10_000);
    const st: EstadoConhecido = { ultimoNsr: 10, primeiroNsr: 1, hashesPorNsr: new Map([[10, "h10"]]) };
    expect(decidirImportacao(st, [{ nsr: 10_010, linhaHash: "a" }]).inserir).toHaveLength(1);
    expect(decidirImportacao(st, [{ nsr: 10_011, linhaHash: "a" }]).quarentena.map(q => q.motivos)).toEqual([["NSR_SALTO_ANOMALO"]]);
    expect(decidirImportacao(st, [{ nsr: 10_011, linhaHash: "a" }], { limiteSaltoNsr: 50_000 }).inserir).toHaveLength(1);
    const d = decidirImportacao(st, [{ nsr: 11, linhaHash: "a" }, { nsr: 900_000_012, linhaHash: "b" }, { nsr: 12, linhaHash: "c" }]);
    expect(d.inserir.map(x => x.nsr)).toEqual([11, 12]);
    expect(d.novoUltimoNsr).toBe(12);
    expect(d.lacunas).toEqual([]); // a quarentena não abre lacuna falsa até 900 milhões
  });

  it("análise de lacunas além de 1 milhão de NSRs é sinalizada (não truncada em silêncio)", () => {
    const d = decidirImportacao(vazio, [{ nsr: 1, linhaHash: "a" }, { nsr: 2_000_000, linhaHash: "b" }], { limiteSaltoNsr: 10_000_000 });
    expect(d.lacunasTruncadasEm).toBe(1_000_002);
    const p = parse(base);
    expect(inconsistenciasDaImportacao(p, { ...d, inserir: [] }).some(i => i.codigo === "NSR_LACUNA" && /parou no NSR/.test(i.mensagem))).toBe(true);
  });
});

describe("P8-R2-03: estado incompleto não vira inserção", () => {
  it("estado diz último = 10, sem hashes: reimportar 1..10 → tudo ESTADO_INCOMPLETO, inclusive NSR 10", () => {
    const p = parse(base);
    const d = planejarImportacao({ ultimoNsr: 10, primeiroNsr: 1, hashesPorNsr: new Map() }, p);
    expect(d.inserir).toEqual([]);
    expect(d.quarentena.map(q => q.registro.nsr)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(d.quarentena.every(q => q.motivos.join() === "ESTADO_INCOMPLETO")).toBe(true);
    expect(inconsistenciasDaImportacao(p, d).filter(i => i.codigo === "ESTADO_INCOMPLETO")).toHaveLength(10);
    expect(relatorioImportacao(p, d).status).toBe("COM_ERROS");
  });

  it("faltam só alguns hashes ≤ último: essas linhas ficam retidas, as demais são duplicadas; lacuna declarada nunca cobre o último NSR", () => {
    const regs = parse(base).registros;
    const st = estadoDe(regs.filter(r => r.nsr !== 7 && r.nsr !== 10), [{ de: 7, ate: 7 }, { de: 10, ate: 10 }]);
    st.ultimoNsr = 10;
    const d = decidirImportacao(st, regs);
    expect(d.duplicadas.map(x => x.nsr)).toEqual([1, 2, 3, 4, 5, 6, 8, 9]);
    expect(d.inserir.map(x => x.nsr)).toEqual([7]); // lacuna 7 declarada e coerente entre 6 e 8
    expect(d.quarentena.map(q => [q.registro.nsr, q.motivos])).toEqual([[10, ["ESTADO_INCOMPLETO"]]]);
  });

  it("abaixo do primeiro NSR gravado (ou sem primeiroNsr) continua NSR_ABAIXO_DO_CURSOR", () => {
    expect(decidirImportacao({ ultimoNsr: 510, hashesPorNsr: new Map([[510, "x"]]) }, [{ nsr: 505, linhaHash: "a" }]).quarentena.map(q => q.motivos)).toEqual([["NSR_ABAIXO_DO_CURSOR"]]);
    expect(decidirImportacao({ ultimoNsr: 510, primeiroNsr: 500, hashesPorNsr: new Map([[500, "y"], [510, "x"]]) }, [{ nsr: 499, linhaHash: "a" }]).quarentena.map(q => q.motivos)).toEqual([["NSR_ABAIXO_DO_CURSOR"]]);
  });
});

describe("P8-R2-04: depois de um tipo 2 que troca para outro empregador, as marcações ficam em quarentena", () => {
  const outro = gerarCnpj("998887770001");
  const tipo2Outro = (nsr: number) => comCrc(num(nsr, 9) + "2" + "2026-10-01T09:00:00-0300" + num(Number(CPF_RESP), 14) + "1" + pad(outro, 14) + pad("", 14) + pad("Outra Empresa Fictícia", 150) + pad("Outro local", 100));
  const linhas = [
    cabecalho(), tipo2(1), tipo3(2, "2026-10-01T08:00:00-0300", CPF_A), tipo2Outro(3), tipo3(4, "2026-10-01T10:00:00-0300", CPF_B), tipo3(5, "2026-10-01T11:00:00-0300", CPF_B),
    tipo2(6, { dh: "2026-10-01T11:30:00-0300" }), tipo3(7, "2026-10-01T12:00:00-0300", CPF_A), trailer({ "2": 3, "3": 4 }), assinaturaRepC(),
  ];

  it("marcações 4 e 5 (sob o outro empregador) → quarentena; volta ao empregador permitido no NSR 6 → a 7 entra", () => {
    const p = parse(linhas, { empregadoresPermitidos: [CNPJ_EMPREGADOR] });
    const d = planejarImportacao(vazio, p);
    expect(d.inserir.map(x => x.nsr)).toEqual([1, 2, 6, 7]);
    expect(d.quarentena.map(q => [q.registro.nsr, q.motivos])).toEqual([[3, ["EMPREGADOR_FORA_DA_EMPRESA"]], [4, ["MARCACAO_SOB_OUTRO_EMPREGADOR"]], [5, ["MARCACAO_SOB_OUTRO_EMPREGADOR"]]]);
    expect(relatorioImportacao(p, d).status).toBe("COM_ERROS");
  });

  it("sem empregadoresPermitidos, nada muda (o core não sabe quem é a empresa)", () => {
    const d = planejarImportacao(vazio, parse(linhas));
    expect(d.inserir.map(x => x.nsr)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});

describe("P8-R2-05: ganho de memória no REP-C sem efeito colateral", () => {
  it("registros sem problema compartilham array vazio congelado; acrescentar problema depois faz cópia", () => {
    const l = [cabecalho({ dataFinal: "2026-10-01" }), tipo3(1, "2026-10-01T08:00:00-0300", CPF_A), tipo3(2, "2026-10-01T08:00:00-0300", CPF_B), tipo3(3, "2026-10-02T08:00:00-0300", CPF_B), trailer({ "3": 3 }), assinaturaRepC()];
    const [a, b, c] = parse(l).registros;
    expect(a.problemas).toBe(b.problemas);
    expect(Object.isFrozen(a.problemas)).toBe(true);
    expect(c.problemas).toEqual(["DATA_FORA_DO_PERIODO"]); // cópia, não mexeu no array compartilhado
    expect(a.problemas).toEqual([]);
  });

  it("a mesma data e hora é lida uma vez e compartilhada (objeto congelado)", () => {
    const [a, b] = parse([cabecalho(), tipo3(1, "2026-10-01T08:00:00-0300", CPF_A), tipo3(2, "2026-10-01T08:00:00-0300", CPF_B), trailer({ "3": 2 }), assinaturaRepC()]).registros as Array<Registro & { marcadoEm: unknown }>;
    expect(a.marcadoEm).toBe(b.marcadoEm);
    expect(Object.isFrozen(a.marcadoEm)).toBe(true);
  });
});
