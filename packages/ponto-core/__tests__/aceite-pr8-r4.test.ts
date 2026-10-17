import { describe, expect, it } from "vitest";
import {
  avaliarCrcRegistros, crc16KermitHex, decidirImportacao, inconsistenciasDaImportacao, LIMITES_CRC_PADRAO, parseAfd, planejarImportacao,
  relatorioImportacao, type EstadoConhecido, type OpcoesParser,
} from "../src";
import { assinaturaRepC, cabecalho, CPF_A, montarAfd, tipo3, trailer } from "./fixtures/gerador";

/**
 * Regressões do aceite do PR #8, rodada 4 (relatorio-aceite-pr8-r4.md, P8-R4-01): a verificabilidade do CRC é
 * decidida pela proporção de registros que conferem com o KERMIT (≥ 90% verificável; ≤ 1% outro algoritmo; entre os
 * dois inconsistente), e a opção explícita `crcVerificavel` sempre vence. Reproduz as sondas r4.mts e r4-coinc.mts.
 */
const T0 = Date.parse("2026-10-01T03:00:00Z");
const dhMin = (m: number) => new Date(T0 + m * 60_000 - 3 * 3_600_000).toISOString().slice(0, 16) + ":00-0300";
const hex4 = (c: number) => c.toString(16).toUpperCase().padStart(4, "0");
const ccitt = (s: string) => {
  let c = 0xffff;
  for (let k = 0; k < s.length; k++) {
    c ^= s.charCodeAt(k) << 8;
    for (let i = 0; i < 8; i++) c = c & 0x8000 ? ((c << 1) ^ 0x1021) & 0xffff : (c << 1) & 0xffff;
  }
  return hex4(c);
};
const arc = (s: string) => {
  let c = 0;
  for (let k = 0; k < s.length; k++) {
    c ^= s.charCodeAt(k);
    for (let i = 0; i < 8; i++) c = c & 1 ? (c >>> 1) ^ 0xa001 : c >>> 1;
  }
  return hex4(c);
};
const aleatorio = () => {
  let seed = 42;
  return (_: string) => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return hex4((seed >> 8) & 0xffff);
  };
};
type Algoritmo = (corpo: string) => string;
const vazio: EstadoConhecido = { ultimoNsr: null, hashesPorNsr: new Map() };

/** REP-C com as marcações `de..ate` e o CRC recalculado por `alg`; devolve as linhas e os NSRs que coincidem com o KERMIT. */
function repC(de: number, ate: number, alg: Algoritmo) {
  const corpo: string[] = [];
  const coincidencias: number[] = [];
  for (let n = de; n <= ate; n++) {
    const b = tipo3(n, dhMin(n), CPF_A).slice(0, -4);
    const crc = alg(b);
    if (crc === crc16KermitHex(b).toUpperCase()) coincidencias.push(n);
    corpo.push(b + crc);
  }
  return { linhas: [cabecalho({ dataFinal: "2027-12-31" }), ...corpo, trailer({ "3": corpo.length }), assinaturaRepC()], coincidencias };
}
const importar = (linhas: string[], estado: EstadoConhecido = vazio, opcoes?: OpcoesParser) => {
  const p = parseAfd(montarAfd(linhas), opcoes);
  const d = planejarImportacao(estado, p);
  return { p, d, r: relatorioImportacao(p, d), inc: inconsistenciasDaImportacao(p, d) };
};

describe("P8-R4-01: 300 mil linhas em CRC de outro algoritmo, com coincidências casuais com o KERMIT", () => {
  for (const [nome, alg] of [["CRC-16/CCITT", ccitt], ["CRC-16/ARC", arc], ["CRC aleatório", aleatorio()]] as const) {
    it(`${nome}: não verificável, cursor no último NSR, nenhuma quarentena`, () => {
      const N = 300_000;
      const { linhas, coincidencias } = repC(1, N, alg);
      expect(coincidencias.length).toBeGreaterThan(0); // o cenário do achado: há linhas que conferem por acaso
      const { p, d, r, inc } = importar(linhas);
      expect(p.crcConferencia).toMatchObject({ situacao: "nao-verificavel", comCrc: N, conferem: coincidencias.length });
      expect(p.crcVerificavel).toBe(false);
      expect(d.crcVerificavel).toBe(false);
      expect(d.quarentena).toHaveLength(0);
      expect(d.inserir).toHaveLength(N);
      expect(d.novoUltimoNsr).toBe(N);
      expect(p.inconsistencias.some(i => i.codigo === "NSR_FORA_DE_ORDEM")).toBe(false);
      expect(inc.filter(i => i.codigo === "CRC_NAO_VERIFICAVEL")).toHaveLength(1);
      expect(r.status).toBe("COM_AVISOS");
    }, 240_000);
  }
});

describe("P8-R4-01: arquivo de 20 mil linhas em CRC-16/CCITT seguido da próxima coleta", () => {
  it("o cursor vai a 20.000 (não trava na coincidência) e a coleta 20001..20100 entra sem quarentena", () => {
    const a = repC(1, 20_000, ccitt);
    expect(a.coincidencias.length).toBeGreaterThan(0);
    const i1 = importar(a.linhas);
    expect(i1.d).toMatchObject({ crcVerificavel: false, novoUltimoNsr: 20_000 });
    expect(i1.d.quarentena).toEqual([]);
    const estado: EstadoConhecido = {
      ultimoNsr: i1.d.novoUltimoNsr, primeiroNsr: 1,
      hashesPorNsr: new Map(i1.d.inserir.map(x => [x.nsr, x.linhaHash])),
      instantesPorNsr: new Map(i1.d.inserir.map(x => [x.nsr, x.instante as number])),
      lacunasConhecidas: i1.d.lacunas,
    };
    const b = repC(20_001, 20_100, ccitt);
    const i2 = importar(b.linhas, estado);
    expect(i2.d.inserir).toHaveLength(100);
    expect(i2.d.quarentena).toEqual([]);
    expect(i2.d.lacunas).toEqual([]);
    expect(i2.d.novoUltimoNsr).toBe(20_100);
  }, 120_000);
});

describe("P8-R4-01: ataque com uma única linha KERMIT inserida de propósito", () => {
  const comUmaKermit = (n: number, alvo: number) => {
    const { linhas } = repC(1, n, ccitt);
    linhas[alvo] = tipo3(alvo, dhMin(alvo), CPF_A); // a linha do NSR `alvo` com CRC KERMIT válido
    return linhas;
  };

  it("REP-C de 1.000 linhas em CCITT com 1 linha KERMIT: continua não verificável, nada vai para quarentena", () => {
    const { p, d } = importar(comUmaKermit(1_000, 500));
    expect(p.crcConferencia?.situacao).toBe("nao-verificavel");
    expect(d).toMatchObject({ crcVerificavel: false, novoUltimoNsr: 1_000 });
    expect(d.quarentena).toEqual([]);
  });

  it("arquivo pequeno (50 linhas, 2%): CRC_INCONSISTENTE, tratado como não verificável; cursor 50 e nenhuma quarentena", () => {
    const { p, d, inc } = importar(comUmaKermit(50, 25));
    expect(p.crcConferencia).toMatchObject({ situacao: "inconsistente", conferem: 1, comCrc: 50 });
    expect(p.inconsistencias.filter(i => i.codigo === "CRC_INCONSISTENTE")).toMatchObject([{ severidade: "aviso", mensagem: expect.stringMatching(/1 de 50/) }]);
    expect(inc.some(i => i.codigo === "CRC_NAO_VERIFICAVEL")).toBe(false);
    expect(d).toMatchObject({ crcVerificavel: false, novoUltimoNsr: 50 });
    expect(d.quarentena).toEqual([]);
  });

  it("decidirImportacao direto (sem parser) deduz pela mesma proporção", () => {
    const p = parseAfd(montarAfd(comUmaKermit(1_000, 500)));
    expect(decidirImportacao(vazio, p.registros)).toMatchObject({ crcVerificavel: false, novoUltimoNsr: 1_000 });
  });
});

describe("P8-R4-01: limites configuráveis e prioridade da opção explícita", () => {
  /** REP-C KERMIT de 20 linhas com `ruins` linhas de CRC trocado no fim. */
  const kermitComRuins = (ruins: number) => {
    const corpo = Array.from({ length: 20 }, (_, i) => tipo3(i + 1, dhMin(i + 1), CPF_A));
    for (let k = 20 - ruins; k < 20; k++) corpo[k] = corpo[k].slice(0, -4) + (corpo[k].endsWith("0000") ? "0001" : "0000");
    return [cabecalho({ dataFinal: "2027-12-31" }), ...corpo, trailer({ "3": 20 }), assinaturaRepC()];
  };

  it("padrão 90% / 1%; 85% é inconsistente por padrão e verificável com minimoVerificavel 0,8", () => {
    expect(LIMITES_CRC_PADRAO).toEqual({ minimoVerificavel: 0.9, maximoNaoVerificavel: 0.01 });
    expect(importar(kermitComRuins(0)).p.crcConferencia).toMatchObject({ situacao: "verificavel", proporcao: 1 });
    expect(importar(kermitComRuins(2)).p.crcVerificavel).toBe(true); // 90%
    expect(importar(kermitComRuins(3)).p.crcConferencia?.situacao).toBe("inconsistente"); // 85%
    const ajustado = importar(kermitComRuins(3), vazio, { limitesCrc: { minimoVerificavel: 0.8 } });
    expect(ajustado.p.crcVerificavel).toBe(true);
    expect(ajustado.d.novoUltimoNsr).toBe(17); // verificável: os 3 de CRC inválido não avançam o cursor
    expect(avaliarCrcRegistros([{ problemas: ["CRC_INVALIDO"] }, { problemas: [] }], { maximoNaoVerificavel: 0.5 }).situacao).toBe("nao-verificavel");
  });

  it("crcVerificavel explícito (algoritmo gravado por REP) vence a heurística, nos dois sentidos", () => {
    // REP-C em CCITT com cadastro dizendo "outro algoritmo": sem heurística, aviso de cadastro
    const alt = importar(repC(1, 100, ccitt).linhas, vazio, { crcVerificavel: false });
    expect(alt.p.crcVerificavel).toBe(false);
    expect(alt.p.inconsistencias.filter(i => i.codigo === "CRC_NAO_VERIFICAVEL")).toMatchObject([{ mensagem: expect.stringMatching(/cadastro do REP/) }]);
    expect(alt.d.novoUltimoNsr).toBe(100);
    // REP KERMIT pelo cadastro com 85% no arquivo: explícito true, sem CRC_INCONSISTENTE, CRC inválido não avança o cursor
    const k = importar(kermitComRuins(3), vazio, { crcVerificavel: true });
    expect(k.p.inconsistencias.some(i => i.codigo === "CRC_INCONSISTENTE")).toBe(false);
    expect(k.d).toMatchObject({ crcVerificavel: true, novoUltimoNsr: 17 });
    // a medição continua disponível para a F2 gravar o algoritmo na 1ª importação
    expect(k.p.crcConferencia).toMatchObject({ comCrc: 20, conferem: 17 });
    // planejarImportacao: a opção da decisão também vence o que o parser decidiu
    const p = parseAfd(montarAfd(kermitComRuins(0)));
    expect(planejarImportacao(vazio, p, { crcVerificavel: false }).crcVerificavel).toBe(false);
  });
});
