import { describe, expect, it } from "vitest";
import { parseAfd } from "../src/parser";
import { sha256Hex } from "../src/hash";
import { codificarLatin1 } from "../src/latin1";
import type { OpcoesParser, ResultadoParser } from "../src/tipos";
import {
  assinaturaP7s, cabecalho, CNPJ_ALFANUMERICO, CPF_A, CPF_B, CPF_RESP, linhasRepC, linhasRepP, montarAfd, tipo3, tipo6, tipo7, trailer,
} from "./fixtures/gerador";

const parse = (linhas: string[], opcoes?: OpcoesParser, quebra?: string) => parseAfd(montarAfd(linhas, quebra), opcoes);
const codigos = (r: ResultadoParser) => r.inconsistencias.map(i => i.codigo);
/** Troca a linha `i` da fixture. */
const trocar = (linhas: string[], i: number, nova: string) => linhas.map((l, j) => (j === i ? nova : l));

describe("parseAfd: fixtures válidas", () => {
  it("REP-C sintético (tipos 1, 2, 3, 4, 5, 6, 9 + assinatura) é lido sem inconsistência", () => {
    const r = parse(linhasRepC());
    expect(r.inconsistencias).toEqual([]);
    expect(r.leiaute).toBe("671-004");
    expect(r.tipoRep).toBeNull();
    expect(r.contagemPorTipo).toEqual({ "2": 1, "3": 5, "4": 1, "5": 2, "6": 1, "7": 0 });
    expect(r.registros.map(x => x.nsr)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(r.cabecalho).toMatchObject({ idEmpregador: expect.any(String), versaoLeiaute: "004", modeloRep: "REP SINTETICO MODELO X", dataInicial: "2026-10-01", dataFinal: "2026-10-31" });
    expect(r.trailer!.quantidades).toEqual({ "2": 1, "3": 5, "4": 1, "5": 2, "6": 1, "7": 0 });
    expect(r.assinatura).toMatchObject({ literalP7s: false });
    expect(r.invalidas).toEqual([]);
  });

  it("REP-P sintético (tipo 7 com cadeia de hash) é lido sem inconsistência e infere REP-P", () => {
    const r = parse(linhasRepP());
    expect(r.inconsistencias).toEqual([]);
    expect(r.tipoRep).toBe("P");
    const marcacoes = r.registros.filter(x => x.tipo === "7");
    expect(marcacoes).toHaveLength(3);
    expect(marcacoes[1]).toMatchObject({ coletor: "01", offline: true, cpf: CPF_B });
    expect(marcacoes[1].tipo === "7" && marcacoes[1].gravadoEm!.utc).toBe("2026-10-01T11:10:00.000Z");
    expect(r.assinatura).toMatchObject({ literalP7s: true });
    expect(r.cabecalho!.numeroRep).toBe("5120220000001");
  });

  it("CPF nos dois formatos do FAQ 50, fusos -0300/-0200 e latin1 com acentos", () => {
    const r = parse(linhasRepC());
    const m = r.registros.filter(x => x.tipo === "3");
    expect(m.map(x => x.tipo === "3" && x.cpf)).toEqual([CPF_A, CPF_B, CPF_A, CPF_A, CPF_A]);
    const ultima = m.at(-1)!;
    expect(ultima.tipo === "3" && ultima.marcadoEm).toMatchObject({ texto: "2026-10-01T18:00:00-0200", utc: "2026-10-01T20:00:00.000Z", fuso: "-0200" });
    expect(r.cabecalho!.razaoSocial).toBe("Indústria Sintética de Injeção Ltda (FICTÍCIA)");
    const emp = r.registros.find(x => x.tipo === "5" && x.nsr === 3);
    expect(emp?.tipo === "5" && emp.nome).toBe("Trabalhadora Fictícia B (São João)");
    const t2 = r.registros.find(x => x.tipo === "2");
    expect(t2?.tipo === "2" && t2.cpfResponsavel).toBe(CPF_RESP);
    const t4 = r.registros.find(x => x.tipo === "4");
    expect(t4?.tipo === "4" && t4.ajustadoPara!.texto).toBe("2026-10-01T16:02:00-0300");
  });

  it("cada linha guarda número, linha bruta e SHA-256 da linha", () => {
    const linhas = linhasRepC();
    const r = parse(linhas);
    for (const reg of r.registros) {
      expect(reg.linhaBruta).toBe(linhas[reg.numeroLinha - 1]);
      expect(reg.linhaHash).toBe(sha256Hex(reg.linhaBruta));
    }
    expect(r.sha256Arquivo).toBe(sha256Hex(montarAfd(linhas)));
    expect(r.totalLinhas).toBe(linhas.length);
  });

  it("CNPJ alfanumérico no cabeçalho é aceito", () => {
    const r = parse(trocar(linhasRepC(), 0, cabecalho({ id: CNPJ_ALFANUMERICO })));
    expect(r.inconsistencias).toEqual([]);
    expect(r.cabecalho!.idEmpregador).toBe("12ABC34501DE35");
  });
});

describe("parseAfd: cada defeito gera a inconsistência esperada", () => {
  it("linha com tamanho errado → TAMANHO_INVALIDO, vai para inválidas e continua contando no trailer", () => {
    const linhas = linhasRepC();
    const r = parse(trocar(linhas, 4, linhas[4] + "X"));
    expect(codigos(r)).toEqual(["TAMANHO_INVALIDO"]);
    expect(r.invalidas).toMatchObject([{ numeroLinha: 5, nsr: 4, tipo: "3", motivo: "TAMANHO_INVALIDO" }]);
    expect(r.registros.map(x => x.nsr)).not.toContain(4);
  });

  it("CRC adulterado → CRC_INVALIDO (aviso no REP-C; erro no REP-A/REP-P; ignorável)", () => {
    const linhas = linhasRepC();
    const adulterada = linhas[4].slice(0, -4) + (linhas[4].endsWith("0000") ? "FFFF" : "0000");
    const r = parse(trocar(linhas, 4, adulterada));
    // 8 de 9 registros com CRC conferem (88,9%, abaixo dos 90%): também sai CRC_INCONSISTENTE (P8-R4-01)
    expect(r.inconsistencias).toMatchObject([{ codigo: "CRC_INVALIDO", severidade: "aviso", nsr: 4, numeroLinha: 5 }, { codigo: "CRC_INCONSISTENTE", severidade: "aviso" }]);
    expect(r.registros.find(x => x.nsr === 4)!.problemas).toEqual(["CRC_INVALIDO"]);
    // REP-A: CRC vira erro (a assinatura não literal da fixture de REP-C também é apontada)
    const comoRepA = parse(trocar(linhas, 4, adulterada), { tipoRep: "A" }).inconsistencias;
    expect(comoRepA.filter(i => i.codigo === "CRC_INVALIDO")).toMatchObject([{ severidade: "erro" }]);
    expect(comoRepA.map(i => i.codigo)).toEqual(["CRC_INVALIDO", "ASSINATURA_INVALIDA"]);
    expect(parse(trocar(linhas, 4, adulterada), { crc: "ignorar" }).inconsistencias).toEqual([]);
    // conteúdo alterado com CRC antigo também é pego
    const conteudo = tipo3(4, "2026-10-01T07:59:00-0300", CPF_A).slice(0, -4) + linhas[4].slice(-4);
    expect(codigos(parse(trocar(linhas, 4, conteudo)))).toEqual(["CRC_INVALIDO", "CRC_INCONSISTENTE"]);
    // com o algoritmo do REP informado (caminho da F2), só o CRC da linha
    expect(codigos(parse(trocar(linhas, 4, conteudo), { crcVerificavel: true }))).toEqual(["CRC_INVALIDO"]);
  });

  it("CRC do cabeçalho adulterado → CRC_INVALIDO", () => {
    const linhas = linhasRepC();
    const cab = linhas[0].slice(0, -4) + "ZZZZ";
    expect(codigos(parse(trocar(linhas, 0, cab)))).toEqual(["CRC_INVALIDO"]);
  });

  it("trailer com contagem errada → TRAILER_DIVERGENTE por tipo", () => {
    const linhas = linhasRepC();
    const r = parse(trocar(linhas, 11, trailer({ "2": 1, "3": 4, "4": 1, "5": 2, "6": 2 })));
    expect(r.inconsistencias.map(i => [i.codigo, i.campo])).toEqual([["TRAILER_DIVERGENTE", "quantidadeTipo3"], ["TRAILER_DIVERGENTE", "quantidadeTipo6"]]);
  });

  it("CPF fora dos formatos do FAQ 50 → CAMPO_INVALIDO; dígito errado → CPF_INVALIDO (aviso)", () => {
    const linhas = linhasRepC();
    // " " + 11 dígitos (espaço à esquerda) não é formato do FAQ 50
    const r = parse(trocar(linhas, 4, tipo3(4, "2026-10-01T07:58:00-0300", CPF_A).replace(`0${CPF_A}`, ` ${CPF_A}`)), { crc: "ignorar" });
    expect(codigos(r)).toEqual(["CAMPO_INVALIDO"]);
    expect(r.inconsistencias[0].campo).toBe("cpf");
    const cpfErrado = CPF_A.slice(0, 10) + ((Number(CPF_A[10]) + 1) % 10);
    const r2 = parse(trocar(linhas, 4, tipo3(4, "2026-10-01T07:58:00-0300", cpfErrado)));
    expect(r2.inconsistencias).toMatchObject([{ codigo: "CPF_INVALIDO", severidade: "aviso", campo: "cpf" }]);
  });

  it("DH inválida → CAMPO_INVALIDO; segundos ≠ 00 → DH_SEGUNDOS (aviso)", () => {
    const linhas = linhasRepC();
    expect(parse(trocar(linhas, 4, tipo3(4, "2026-13-01T07:58:00-0300", CPF_A))).inconsistencias).toMatchObject([{ codigo: "CAMPO_INVALIDO", campo: "marcadoEm" }]);
    expect(parse(trocar(linhas, 4, tipo3(4, "2026-10-01T07:58:30-0300", CPF_A))).inconsistencias).toMatchObject([{ codigo: "DH_SEGUNDOS", severidade: "aviso" }]);
  });

  it("arquivo com LF em vez de CR LF → QUEBRA_LF (aviso) e mesmos registros", () => {
    const r = parse(linhasRepC(), undefined, "\n");
    expect(r.inconsistencias).toMatchObject([{ codigo: "QUEBRA_LF", severidade: "aviso", numeroLinha: 1 }]);
    expect(r.registros.map(x => x.linhaHash)).toEqual(parse(linhasRepC()).registros.map(x => x.linhaHash));
  });

  it("sem quebra na última linha → SEM_QUEBRA_FINAL (aviso)", () => {
    const bytes = montarAfd(linhasRepC());
    const r = parseAfd(bytes.subarray(0, bytes.length - 2));
    expect(codigos(r)).toEqual(["SEM_QUEBRA_FINAL"]);
    expect(r.assinatura).not.toBeNull();
  });

  it("linha em branco → LINHA_EM_BRANCO", () => {
    const linhas = linhasRepC();
    const r = parse([...linhas.slice(0, 3), "", ...linhas.slice(3)]);
    expect(r.inconsistencias).toMatchObject([{ codigo: "LINHA_EM_BRANCO", numeroLinha: 4 }]);
  });

  it("CNPJ do empregador com DV errado → CNPJ_CPF_INVALIDO", () => {
    const r = parse(trocar(linhasRepC(), 0, cabecalho({ id: "12ABC34501DE36" })));
    expect(r.inconsistencias).toMatchObject([{ codigo: "CNPJ_CPF_INVALIDO", severidade: "erro", campo: "idEmpregador" }]);
  });

  it("assinatura: REP-P sem o literal → ASSINATURA_INVALIDA; sem assinatura → ASSINATURA_AUSENTE (erro no P, aviso no C)", () => {
    const p = linhasRepP();
    expect(codigos(parse(trocar(p, p.length - 1, "ASSINATURA_QUALQUER".padEnd(100, " "))))).toEqual(["ASSINATURA_INVALIDA"]);
    expect(parse(p.slice(0, -1)).inconsistencias).toMatchObject([{ codigo: "ASSINATURA_AUSENTE", severidade: "erro" }]);
    expect(parse(linhasRepC().slice(0, -1)).inconsistencias).toMatchObject([{ codigo: "ASSINATURA_AUSENTE", severidade: "aviso" }]);
    expect(assinaturaP7s()).toHaveLength(100);
  });

  it("cadeia de hash do tipo 7 adulterada → HASH_CADEIA_INVALIDA (aviso por padrão; erro por opção)", () => {
    const p = linhasRepP();
    const adulterada = p[1].slice(0, 73) + "0".repeat(64);
    const r = parse(trocar(p, 1, adulterada));
    // o registro adulterado não confere; o seguinte também não, porque encadeia no hash gravado (adulterado)
    expect(r.inconsistencias.map(i => [i.codigo, i.nsr, i.severidade])).toEqual([["HASH_CADEIA_INVALIDA", 1, "aviso"], ["HASH_CADEIA_INVALIDA", 2, "aviso"]]);
    expect(parse(trocar(p, 1, adulterada), { cadeiaHash: "erro" }).inconsistencias[0].severidade).toBe("erro");
    expect(parse(trocar(p, 1, adulterada), { cadeiaHash: "ignorar" }).inconsistencias).toEqual([]);
  });

  it("arquivo parcial de REP-P usa o hash anterior informado; sem ele o 1º elo é não verificável, não inválido (P8-05)", () => {
    const a = tipo7(10, { dh: "2026-10-02T08:00:00-0300", cpf: CPF_A, hashAnterior: "ab".repeat(32) });
    const linhas = [cabecalho({ numeroRep: "5120220000001", modelo: "" }), a.linha, trailer({ "7": 1 }), assinaturaP7s()];
    // antes (aceite P8-05): HASH_CADEIA_INVALIDA falso
    expect(parse(linhas).inconsistencias).toMatchObject([{ codigo: "CADEIA_NAO_VERIFICAVEL", severidade: "aviso", nsr: 10 }]);
    expect(parse(linhas, { cadeiaHash: "erro" }).registros[0].errosGraves).toEqual([]);
    // hash anterior errado informado: aí sim é inválido
    expect(codigos(parse(linhas, { hashAnteriorInicial: "cd".repeat(32) }))).toEqual(["HASH_CADEIA_INVALIDA"]);
    expect(parse(linhas, { hashAnteriorInicial: "AB".repeat(32) }).inconsistencias).toEqual([]);
  });

  it("NSR fora de ordem e NSR repetido", () => {
    const linhas = linhasRepC();
    const trocadas = [...linhas];
    [trocadas[4], trocadas[5]] = [trocadas[5], trocadas[4]];
    expect(parse(trocadas).inconsistencias).toMatchObject([{ codigo: "NSR_FORA_DE_ORDEM", nsr: 4 }]);
    const repetida = [...linhas.slice(0, 6), linhas[5], ...linhas.slice(6)];
    const r = parse(repetida);
    expect(codigos(r)).toEqual(["NSR_DUPLICADO_NO_ARQUIVO", "TRAILER_DIVERGENTE"]);
  });

  it("cabeçalho ausente, duplicado ou fora de posição (ordem padrão do Control iD sem headerTop)", () => {
    const linhas = linhasRepC();
    expect(codigos(parse(linhas.slice(1)))).toEqual(["CABECALHO_AUSENTE"]);
    expect(codigos(parse([linhas[0], ...linhas]))).toEqual(["CABECALHO_DUPLICADO"]);
    const controlId = [...linhas.slice(1, -2), linhas[0], ...linhas.slice(-2)];
    expect(codigos(parse(controlId))).toEqual(["CABECALHO_FORA_DE_POSICAO"]);
  });

  it("trailer ausente, registro depois da assinatura e tipo desconhecido", () => {
    const linhas = linhasRepC();
    expect(codigos(parse(linhas.slice(0, -2)))).toEqual(["TRAILER_AUSENTE", "ASSINATURA_AUSENTE"]);
    expect(codigos(parse([...linhas, linhas[4]]))).toEqual(["REGISTRO_APOS_TRAILER"]);
    const tipo8 = "000000011" + "8" + "x".repeat(40);
    const r = parse([...linhas.slice(0, -2), tipo8, ...linhas.slice(-2)]);
    expect(codigos(r)).toEqual(["TIPO_DESCONHECIDO"]);
    expect(r.invalidas).toMatchObject([{ tipo: "8", nsr: 11, motivo: "TIPO_DESCONHECIDO" }]);
  });

  it("marcação fora do período do cabeçalho → DATA_FORA_DO_PERIODO (aviso)", () => {
    const linhas = linhasRepC();
    const r = parse(trocar(linhas, 4, tipo3(4, "2026-11-01T07:58:00-0300", CPF_A)));
    expect(r.inconsistencias).toMatchObject([{ codigo: "DATA_FORA_DO_PERIODO", severidade: "aviso", nsr: 4 }]);
  });

  it("evento sensível com código desconhecido → CAMPO_INVALIDO", () => {
    const linhas = linhasRepC();
    expect(parse(trocar(linhas, 10, tipo6(10, "99"))).inconsistencias).toMatchObject([{ codigo: "CAMPO_INVALIDO", campo: "codigoEvento" }]);
  });

  it("leiaute legado ou versão diferente → LEIAUTE_NAO_SUPORTADO, sem tentar ler campos", () => {
    const r = parse(trocar(linhasRepC(), 0, cabecalho({ versao: "003" })));
    expect(codigos(r)).toEqual(["LEIAUTE_NAO_SUPORTADO"]);
    expect(r.leiaute).toBe("nao-suportado");
    expect(r.registros).toEqual([]);
    const legado = "000000000" + "1" + "1" + "0".repeat(221); // 232 posições, formato antigo
    expect(parse([legado]).leiaute).toBe("nao-suportado");
  });

  it("arquivo vazio → ARQUIVO_VAZIO", () => {
    const r = parseAfd(new Uint8Array());
    expect(codigos(r)).toEqual(["ARQUIVO_VAZIO"]);
    expect(r.leiaute).toBe("vazio");
  });
});

describe("parseAfd: robustez e LGPD", () => {
  it("nenhuma exceção com entrada arbitrária (bytes aleatórios e fixture com bytes trocados)", () => {
    let seed = 20261017;
    const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const base = montarAfd(linhasRepC());
    for (let i = 0; i < 300; i++) {
      const aleatorio = Uint8Array.from({ length: Math.floor(rand() * 600) }, () => Math.floor(rand() * 256));
      expect(() => parseAfd(aleatorio)).not.toThrow();
      const mutado = Uint8Array.from(base);
      for (let k = 0; k < 1 + Math.floor(rand() * 8); k++) mutado[Math.floor(rand() * mutado.length)] = Math.floor(rand() * 256);
      expect(() => parseAfd(mutado)).not.toThrow();
      expect(() => parseAfd(mutado, { tipoRep: "P", cadeiaHash: "erro" })).not.toThrow();
    }
  });

  it("mensagens de inconsistência nunca trazem CPF", () => {
    const linhas = linhasRepC();
    const cpfErrado = CPF_A.slice(0, 10) + ((Number(CPF_A[10]) + 1) % 10);
    const r = parse([...trocar(linhas, 4, tipo3(4, "2026-10-01T07:58:00-0300", cpfErrado)).slice(0, -2), "lixo", ...linhas.slice(-2)]);
    expect(r.inconsistencias.length).toBeGreaterThan(0);
    for (const i of r.inconsistencias) {
      for (const cpf of [CPF_A, cpfErrado, CPF_B, CPF_RESP]) expect(i.mensagem).not.toContain(cpf);
    }
  });

  it("bytes ISO 8859-1 (não UTF-8) são lidos como latin1", () => {
    const bytes = montarAfd(linhasRepC());
    expect(Array.from(bytes)).toContain(0xfa); // "ú" em latin1
    expect(parseAfd(bytes).cabecalho!.razaoSocial).toContain("Indústria");
    expect(codificarLatin1("ú")[0]).toBe(0xfa);
  });
});
