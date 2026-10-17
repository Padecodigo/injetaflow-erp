import { describe, expect, it } from "vitest";
import { chaveIdempotencia, chaveNatural, identificadorRep } from "../src/idempotencia";
import { parseAfd } from "../src/parser";
import { decidirImportacao } from "../src/pipeline";
import { inconsistenciasCsv, inconsistenciasDaImportacao, relatorioImportacao } from "../src/relatorio";
import { CNPJ_EMPREGADOR, CPF_A, linhasRepC, montarAfd, tipo3 } from "./fixtures/gerador";

describe("chaves de idempotência", () => {
  it("chave natural = empresa + REP + NSR; idempotência acrescenta o hash da linha", () => {
    const c = { empresaId: "empresa-a", repId: "rep-1", nsr: 42 };
    expect(chaveNatural(c)).toBe("empresa-a|rep-1|000000042");
    expect(chaveIdempotencia({ ...c, linhaHash: "ABC" })).toBe("empresa-a|rep-1|000000042|abc");
  });
  it("empresas diferentes nunca colidem, e o separador não é ambíguo", () => {
    expect(chaveNatural({ empresaId: "a", repId: "1", nsr: 1 })).not.toBe(chaveNatural({ empresaId: "b", repId: "1", nsr: 1 }));
    expect(chaveNatural({ empresaId: "a|b", repId: "c", nsr: 1 })).not.toBe(chaveNatural({ empresaId: "a", repId: "b|c", nsr: 1 }));
  });
  it("identificador do REP pelo cabeçalho, por tipo", () => {
    const cab = { idEmpregador: CNPJ_EMPREGADOR, numeroRep: "00004000000123456" };
    expect(identificadorRep(cab, "C")).toBe(`C:${CNPJ_EMPREGADOR}:00004000000123456`);
    expect(identificadorRep({ ...cab, numeroRep: "5120220000001" }, "P")).toBe(`P:${CNPJ_EMPREGADOR}:5120220000001`);
    expect(identificadorRep(cab, "A", "portaria-1")).toBe(`A:${CNPJ_EMPREGADOR}:portaria-1`);
  });
});

describe("relatório de inconsistências", () => {
  it("sem decisão: só os totais do arquivo; status OK", () => {
    const r = relatorioImportacao(parseAfd(montarAfd(linhasRepC())));
    expect(r).toMatchObject({ status: "OK", linhasLidas: 13, marcacoes: 5, invalidas: 0, novas: null, duplicadas: null, erros: 0, avisos: 0 });
  });

  it("com decisão: novas, duplicadas, conflitos, lacunas e status", () => {
    const linhas = linhasRepC();
    const parse = parseAfd(montarAfd(linhas));
    const primeira = relatorioImportacao(parse, decidirImportacao({ ultimoNsr: null, hashesPorNsr: {} }, parse.registros));
    expect(primeira).toMatchObject({ status: "OK", novas: 10, duplicadas: 0, conflitos: 0, nsrsEmLacuna: 0 });
    const estado = { ultimoNsr: 10, hashesPorNsr: new Map(parse.registros.map(r => [r.nsr, r.linhaHash])) };
    expect(relatorioImportacao(parse, decidirImportacao(estado, parse.registros))).toMatchObject({ status: "SEM_NOVIDADES", novas: 0, duplicadas: 10 });
    const outro = parseAfd(montarAfd(linhas.map((x, i) => (i === 4 ? tipo3(4, "2026-10-01T07:59:00-0300", CPF_A) : x))));
    const dConf = decidirImportacao(estado, outro.registros);
    expect(relatorioImportacao(outro, dConf)).toMatchObject({ status: "COM_ERROS", conflitos: 1, duplicadas: 9 });
    const lista = inconsistenciasDaImportacao(outro, dConf);
    expect(lista).toMatchObject([{ codigo: "NSR_CONFLITO", nsr: 4, numeroLinha: 5, severidade: "erro" }]);
  });

  it("retrocesso → BLOQUEADA; leiaute não suportado → REJEITADA; lacuna → COM_AVISOS", () => {
    const parse = parseAfd(montarAfd(linhasRepC()));
    const d = decidirImportacao({ ultimoNsr: 50, hashesPorNsr: { 1: "outro" } }, parse.registros);
    expect(relatorioImportacao(parse, d).status).toBe("BLOQUEADA");
    expect(inconsistenciasDaImportacao(parse, d).map(i => i.codigo)).toContain("NSR_RETROCESSO");
    expect(relatorioImportacao(parseAfd(new Uint8Array())).status).toBe("REJEITADA");
    const lac = decidirImportacao({ ultimoNsr: null, hashesPorNsr: {} }, parse.registros.filter(r => r.nsr !== 5));
    expect(relatorioImportacao(parse, lac)).toMatchObject({ status: "COM_AVISOS", nsrsEmLacuna: 1 });
    expect(inconsistenciasDaImportacao(parse, lac)).toMatchObject([{ codigo: "NSR_LACUNA", nsr: 5, severidade: "aviso" }]);
  });

  it("CSV: separador ;, BOM, CR LF, aspas e proteção contra fórmula", () => {
    const csv = inconsistenciasCsv([
      { codigo: "CRC_INVALIDO", severidade: "aviso", numeroLinha: 5, nsr: 4, campo: "crc", mensagem: 'CRC "x"; ver' },
      { codigo: "LINHA_EM_BRANCO", severidade: "erro", mensagem: "=HYPERLINK(1)" },
    ]);
    expect(csv.startsWith("\uFEFFLinha;NSR;Código;Severidade;Campo;Mensagem\r\n")).toBe(true);
    expect(csv).toContain('5;4;CRC_INVALIDO;aviso;crc;"CRC ""x""; ver"\r\n');
    expect(csv).toContain(";;LINHA_EM_BRANCO;erro;;'=HYPERLINK(1)\r\n");
  });
});
