import { describe, expect, it } from "vitest";
import {
  decidirImportacao, inconsistenciasDaImportacao, parseAfd, planejarImportacao, relatorioImportacao,
  type EstadoConhecido, type OpcoesParser, type ResultadoParser,
} from "../src";
import { codificarLatin1 } from "../src/latin1";
import { crc16KermitHex } from "../src/crc16";
import {
  assinaturaP7s, cabecalho, CNPJ_EMPREGADOR, CPF_A, CPF_B, linhasRepC, linhasRepP, montarAfd, num, tipo2, tipo3, tipo6, tipo7, trailer,
} from "./fixtures/gerador";

/**
 * Regressões do aceite do PR #8 (relatorio-aceite-pr7-pr8.md, P8-01 a P8-09), com AFD 100% sintético.
 * Plano RH/Ponto v2 §3.3 e v3 §4: nada com erro grave vira marcação; nada é descartado (quarentena).
 */
const parse = (linhas: string[], opcoes?: OpcoesParser, quebra?: string) => parseAfd(montarAfd(linhas, quebra), opcoes);
const codigos = (r: ResultadoParser) => r.inconsistencias.map(i => i.codigo);
const vazio: EstadoConhecido = { ultimoNsr: null, hashesPorNsr: new Map() };
const trocar = (linhas: string[], i: number, nova: string) => linhas.map((l, j) => (j === i ? nova : l));
/** Recalcula o CRC de uma linha alterada (para isolar o defeito testado). */
const comCrc = (corpo: string) => corpo + crc16KermitHex(corpo);

describe("P8-01: registros com erro grave vão para quarentena, nunca para inserir", () => {
  it("DH inválida (30/02 25:61) com CRC correto", () => {
    const r = parse(trocar(linhasRepC(), 4, tipo3(4, "2026-02-30T25:61:00-0300", CPF_A)));
    const d = planejarImportacao(vazio, r);
    expect(d.inserir.map(x => x.nsr)).not.toContain(4);
    expect(d.quarentena.map(q => [q.registro.nsr, q.motivos])).toEqual([[4, ["CAMPO_INVALIDO"]]]);
    expect((d.quarentena[0].registro as { marcadoEm: unknown }).marcadoEm).toBeNull();
  });

  it("CPF ilegível (fora do FAQ 50) com CRC correto", () => {
    const r = parse(trocar(linhasRepC(), 4, comCrc(num(4, 9) + "3" + "2026-10-01T07:58:00-0300" + "ABCDEFGHIJKL")));
    const d = planejarImportacao(vazio, r);
    expect(d.quarentena.map(q => q.registro.nsr)).toEqual([4]);
    expect(d.inserir).toHaveLength(9);
  });

  it("CRC adulterado: REP-A/REP-P → quarentena; REP-C (aviso) → inserir", () => {
    const linhas = linhasRepC();
    const ruim = linhas[4].slice(0, -4) + "0000";
    const repA = parse(trocar(linhas, 4, ruim), { tipoRep: "A" });
    const dA = planejarImportacao(vazio, repA);
    expect(dA.quarentena.map(q => [q.registro.nsr, q.motivos])).toEqual([[4, ["CRC_INVALIDO"]]]);
    expect(dA.inserir.map(x => x.nsr)).not.toContain(4);
    const repC = parse(trocar(linhas, 4, ruim), { tipoRep: "C" });
    const dC = planejarImportacao(vazio, repC);
    expect(dC.quarentena).toEqual([]);
    expect(dC.inserir.map(x => x.nsr)).toContain(4);
  });

  it("cadeia de hash inválida quando confirmada (cadeiaHash: 'erro') → quarentena; padrão (aviso) → inserir", () => {
    const linhas = linhasRepP();
    const adulterada = linhas[2].slice(0, 22) + "9" + linhas[2].slice(23); // 08:03 → 09:03 no NSR 2 (DH válida), hash fica errado
    const comErro = planejarImportacao(vazio, parse(trocar(linhas, 2, adulterada), { cadeiaHash: "erro" }));
    expect(comErro.quarentena.map(q => q.registro.nsr)).toContain(2);
    expect(comErro.inserir.map(x => x.nsr)).not.toContain(2);
    const comAviso = planejarImportacao(vazio, parse(trocar(linhas, 2, adulterada)));
    expect(comAviso.inserir.map(x => x.nsr)).toContain(2);
  });

  it("NSR fora de ordem → quarentena do registro que voltou", () => {
    const linhas = linhasRepC();
    const trocadas = [...linhas];
    [trocadas[4], trocadas[5]] = [trocadas[5], trocadas[4]];
    const d = planejarImportacao(vazio, parse(trocadas));
    expect(d.quarentena.map(q => [q.registro.nsr, q.motivos])).toEqual([[4, ["NSR_FORA_DE_ORDEM"]]]);
    expect(d.inserir.map(x => x.nsr)).not.toContain(4);
  });

  it("relatório conta a quarentena e marca COM_ERROS; avisos sozinhos não retêm o registro", () => {
    const r = parse(trocar(linhasRepC(), 4, tipo3(4, "2026-02-30T25:61:00-0300", CPF_A)));
    const d = planejarImportacao(vazio, r);
    expect(relatorioImportacao(r, d)).toMatchObject({ status: "COM_ERROS", quarentena: 1, novas: 9 });
    expect(inconsistenciasDaImportacao(r, d).map(i => i.codigo)).toContain("NSR_QUARENTENA");
    const soAviso = parse(trocar(linhasRepC(), 4, tipo3(4, "2026-10-01T07:58:30-0300", CPF_A))); // DH com segundos: aviso
    expect(planejarImportacao(vazio, soAviso).quarentena).toEqual([]);
  });
});

describe("P8-02: sem estouro de pilha em arquivo grande", () => {
  it("decidirImportacao com 500 mil linhas (estado com 250 mil) não estoura e é linear", () => {
    const linhas = Array.from({ length: 500_000 }, (_, i) => ({ nsr: i + 1, linhaHash: `h${i + 1}` }));
    const hashes = new Map<number, string>();
    for (let n = 1; n <= 250_000; n++) hashes.set(n, `h${n}`);
    const d = decidirImportacao({ ultimoNsr: 250_000, primeiroNsr: 1, hashesPorNsr: hashes }, linhas);
    expect(d.duplicadas).toHaveLength(250_000);
    expect(d.inserir).toHaveLength(250_000);
    expect(d.lacunas).toEqual([]);
  });

  it("AFD sintético com 300 mil marcações: parser + decisão sem RangeError", () => {
    const total = 300_000;
    const partes: string[] = [cabecalho()];
    for (let n = 1; n <= total; n++) {
      const min = n % 1440;
      partes.push(tipo3(n, `2026-10-${String(1 + Math.floor(n / 10_000) % 28).padStart(2, "0")}T${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}:00-0300`, n % 2 ? CPF_A : CPF_B));
    }
    partes.push(trailer({ "3": total }), "Q".repeat(100));
    const r = parseAfd(codificarLatin1(partes.join("\r\n") + "\r\n"));
    expect(r.registros).toHaveLength(total);
    const d = planejarImportacao(vazio, r);
    expect(d.inserir).toHaveLength(total);
    expect(d.quarentena).toEqual([]);
    const reimport = decidirImportacao({ ultimoNsr: total, primeiroNsr: 1, hashesPorNsr: new Map(r.registros.map(x => [x.nsr, x.linhaHash])) }, r.registros);
    expect(reimport.duplicadas).toHaveLength(total);
  }, 180_000);
});

describe("P8-03: NSR abaixo do último importado e ausente da base", () => {
  const estado500: EstadoConhecido = { ultimoNsr: 510, primeiroNsr: 500, hashesPorNsr: new Map(Array.from({ length: 11 }, (_, i) => [500 + i, `h${500 + i}`] as [number, string])) };

  it("vira NSR_ABAIXO_DO_CURSOR em quarentena (possível reset), não entra como novo", () => {
    const d = decidirImportacao(estado500, [{ nsr: 1, linhaHash: "a" }, { nsr: 2, linhaHash: "b" }]);
    expect(d.inserir).toEqual([]);
    expect(d.quarentena.map(q => [q.registro.nsr, q.motivos])).toEqual([[1, ["NSR_ABAIXO_DO_CURSOR"]], [2, ["NSR_ABAIXO_DO_CURSOR"]]]);
    const r = parse(linhasRepC());
    const lista = inconsistenciasDaImportacao(r, { ...d, quarentena: d.quarentena.map(q => ({ ...q, registro: { ...q.registro, numeroLinha: 9 } })) });
    expect(lista.filter(i => i.codigo === "NSR_ABAIXO_DO_CURSOR").map(i => i.mensagem)).toEqual([expect.stringMatching(/possível reset/), expect.stringMatching(/possível reset/)]);
  });

  it("sem primeiroNsr no estado, também retém (conservador)", () => {
    const d = decidirImportacao({ ultimoNsr: 510, hashesPorNsr: new Map([[510, "x"]]) }, [{ nsr: 505, linhaHash: "a" }]);
    expect(d.quarentena.map(q => q.motivos)).toEqual([["NSR_ABAIXO_DO_CURSOR"]]);
  });

  it("dentro de lacuna declarada (re-coleta), com data e hora coerente, é inserido (P8-R2-01/03)", () => {
    const d = decidirImportacao(
      { ultimoNsr: 510, primeiroNsr: 500, hashesPorNsr: new Map([[500, "a"], [510, "b"]]), instantesPorNsr: new Map([[500, 1_000], [510, 9_000]]), lacunasConhecidas: [{ de: 501, ate: 509 }] },
      [{ nsr: 505, linhaHash: "c", instante: 5_000 }],
    );
    expect(d.inserir.map(x => x.nsr)).toEqual([505]);
    expect(d.lacunasPreenchidas.map(x => x.nsr)).toEqual([505]);
    expect(d.quarentena).toEqual([]);
  });
});

describe("P8-04: empregador fora da empresa", () => {
  it("cabeçalho com CNPJ válido de outra empresa → EMPREGADOR_FORA_DA_EMPRESA (erro) e REJEITADA", () => {
    const r = parse(linhasRepC(), { empregadoresPermitidos: ["99.888.777/0001-00"] });
    // cabeçalho (rejeita o arquivo) e o tipo 2 da fixture, que também traz o CNPJ do empregador
    expect(r.inconsistencias.filter(i => i.codigo === "EMPREGADOR_FORA_DA_EMPRESA")).toMatchObject([{ severidade: "erro", numeroLinha: 1 }, { severidade: "erro", nsr: 1 }]);
    expect(r.motivosRejeicao).toEqual(["EMPREGADOR_FORA_DA_EMPRESA"]);
    const d = planejarImportacao(vazio, r);
    expect(d.inserir).toEqual([]);
    expect(d.bloqueada).toBe(true);
    expect(relatorioImportacao(r, d).status).toBe("REJEITADA");
  });

  it("CNPJ da empresa (com ou sem pontuação) passa; sem a opção, nada muda", () => {
    const fmt = `${CNPJ_EMPREGADOR.slice(0, 2)}.${CNPJ_EMPREGADOR.slice(2, 5)}.${CNPJ_EMPREGADOR.slice(5, 8)}/${CNPJ_EMPREGADOR.slice(8, 12)}-${CNPJ_EMPREGADOR.slice(12)}`;
    expect(parse(linhasRepC(), { empregadoresPermitidos: ["11111111000191", fmt] }).inconsistencias).toEqual([]);
    expect(parse(linhasRepC()).inconsistencias).toEqual([]);
  });

  it("empregador CPF (tipo 2 no cabeçalho, '000' + 11 dígitos) compara com o CPF de 11 dígitos", () => {
    const linhas = trocar(linhasRepC(), 0, cabecalho({ tpId: "2", id: `000${CPF_A}` }));
    // (o tipo 2 da fixture continua com CNPJ; aqui só interessa o cabeçalho, que decide a rejeição)
    expect(parse(linhas, { empregadoresPermitidos: [CPF_A] }).motivosRejeicao).toEqual([]);
    expect(parse(linhas, { empregadoresPermitidos: [`${CPF_A.slice(0, 3)}.${CPF_A.slice(3, 6)}.${CPF_A.slice(6, 9)}-${CPF_A.slice(9)}`] }).motivosRejeicao).toEqual([]);
    expect(parse(linhas, { empregadoresPermitidos: [CPF_B] }).motivosRejeicao).toEqual(["EMPREGADOR_FORA_DA_EMPRESA"]);
  });

  it("registro tipo 2 com outro empregador vai para quarentena (troca de empresa no REP)", () => {
    const outro = tipo2(1).replace(CNPJ_EMPREGADOR, "99888777000100");
    const linha = comCrc(outro.slice(0, -4));
    const r = parse(trocar(linhasRepC(), 1, linha), { empregadoresPermitidos: [CNPJ_EMPREGADOR] });
    const d = planejarImportacao(vazio, r);
    expect(d.quarentena[0]).toMatchObject({ registro: { nsr: 1 }, motivos: expect.arrayContaining(["EMPREGADOR_FORA_DA_EMPRESA"]) });
    // P8-R2-04: as marcações depois dele também ficam retidas (ver aceite-pr8-r2.test.ts)
    expect(d.inserir.filter(x => x.tipo === "3")).toEqual([]);
    expect(r.motivosRejeicao).toEqual([]);
  });
});

describe("P8-05: arquivo parcial sem hashAnteriorInicial", () => {
  it("primeiro tipo 7 de arquivo que começa no NSR 2 → CADEIA_NAO_VERIFICAVEL (aviso), não inválida; os elos seguintes são verificados", () => {
    const a = tipo7(2, { dh: "2026-10-01T08:00:00-0300", cpf: CPF_A, hashAnterior: "ab".repeat(32) });
    const b = tipo7(3, { dh: "2026-10-01T09:00:00-0300", cpf: CPF_B, hashAnterior: a.hash });
    const linhas = [cabecalho({ numeroRep: "5120220000001", modelo: "" }), a.linha, b.linha, trailer({ "7": 2 }), assinaturaP7s()];
    const r = parse(linhas, { cadeiaHash: "erro" });
    expect(r.inconsistencias).toMatchObject([{ codigo: "CADEIA_NAO_VERIFICAVEL", severidade: "aviso", nsr: 2 }]);
    expect(planejarImportacao(vazio, r).quarentena).toEqual([]);
    // elo seguinte quebrado continua detectado
    const c = tipo7(3, { dh: "2026-10-01T09:00:00-0300", cpf: CPF_B, hashAnterior: "cd".repeat(32) });
    expect(codigos(parse([linhas[0], a.linha, c.linha, linhas[3], linhas[4]]))).toEqual(["CADEIA_NAO_VERIFICAVEL", "HASH_CADEIA_INVALIDA"]);
  });

  it("arquivo completo (começa no NSR 1) continua verificando o primeiro elo", () => {
    expect(parse(linhasRepP()).inconsistencias).toEqual([]);
    const a = tipo7(1, { dh: "2026-10-01T08:00:00-0300", cpf: CPF_A, hashAnterior: "ab".repeat(32) }); // hash com anterior inexistente
    expect(codigos(parse([cabecalho({ numeroRep: "5120220000001", modelo: "" }), a.linha, trailer({ "7": 1 }), assinaturaP7s()]))).toEqual(["HASH_CADEIA_INVALIDA"]);
  });
});

describe("P8-06: conflito isolado no primeiro NSR não é retrocesso", () => {
  const estado10: EstadoConhecido = { ultimoNsr: 10, primeiroNsr: 1, hashesPorNsr: new Map(Array.from({ length: 10 }, (_, i) => [i + 1, `h${i + 1}`] as [number, string])) };
  const l = (nsr: number, hash = `h${nsr}`) => ({ nsr, linhaHash: hash });

  it("NSR 1 alterado + 2..10 iguais + 11 novo → conflito só no 1, 11 inserido, sem bloqueio", () => {
    const d = decidirImportacao(estado10, [l(1, "alterado"), ...Array.from({ length: 9 }, (_, i) => l(i + 2)), l(11)]);
    expect(d.bloqueada).toBe(false);
    expect(d.retrocesso).toBeUndefined();
    expect(d.conflitos.map(c => c.registro.nsr)).toEqual([1]);
    expect(d.inserir.map(x => x.nsr)).toEqual([11]);
  });

  it("reset real (NSR volta a 1 com conteúdo diferente, nada coincide) continua bloqueando", () => {
    expect(decidirImportacao(estado10, [l(1, "x"), l(2, "y")])).toMatchObject({ bloqueada: true, retrocesso: { ultimoNsr: 10, primeiroNsrArquivo: 1, maiorNsrArquivo: 2 } });
    expect(decidirImportacao(estado10, [l(1, "x")])).toMatchObject({ bloqueada: true });
    const comNovos = decidirImportacao(estado10, [l(1, "x"), l(2, "y"), l(3, "z"), l(11), l(12)]);
    expect(comNovos).toMatchObject({ bloqueada: true, inserir: [] });
    expect(comNovos.retidasPorBloqueio.map(x => x.nsr)).toEqual([11, 12]);
  });
});

describe("P8-07: NSR repetido com conteúdo diferente no mesmo arquivo", () => {
  it("as duas linhas vão para quarentena e nenhuma é inserida", () => {
    const linhas = linhasRepC();
    const outra = tipo3(4, "2026-10-01T09:30:00-0300", CPF_B);
    const r = parse([...linhas.slice(0, 5), outra, ...linhas.slice(5)]);
    const d = planejarImportacao(vazio, r);
    expect(d.quarentena.map(q => [q.registro.nsr, q.registro.numeroLinha, q.motivos])).toEqual([
      [4, 5, ["NSR_DUPLICADO_NO_ARQUIVO"]],
      [4, 6, ["NSR_DUPLICADO_NO_ARQUIVO"]],
    ]);
    expect(d.inserir.map(x => x.nsr)).not.toContain(4);
  });

  it("repetição idêntica: 1 inserida e 1 duplicada (sem quarentena)", () => {
    const linhas = linhasRepC();
    const d = planejarImportacao(vazio, parse([...linhas.slice(0, 5), linhas[4], ...linhas.slice(5)]));
    expect(d.quarentena).toEqual([]);
    expect(d.inserir.filter(x => x.nsr === 4)).toHaveLength(1);
    expect(d.duplicadas.map(x => x.nsr)).toEqual([4]);
  });
});

describe("P8-08: validações de campo", () => {
  it("NSR 000000000 em registro → CAMPO_INVALIDO e quarentena", () => {
    const r = parse(trocar(linhasRepC(), 4, tipo3(0, "2026-10-01T07:58:00-0300", CPF_A)));
    expect(r.inconsistencias).toEqual(expect.arrayContaining([expect.objectContaining({ codigo: "CAMPO_INVALIDO", campo: "nsr", nsr: 0 })]));
    expect(planejarImportacao(vazio, r).quarentena.map(q => q.registro.nsr)).toContain(0);
  });

  it("campo 7 do cabeçalho (190–206) precisa ser numérico, alinhado à esquerda", () => {
    expect(codigos(parse(trocar(linhasRepC(), 0, cabecalho({ numeroRep: "ABC123" }))))).toEqual(["CAMPO_INVALIDO"]);
    expect(codigos(parse(trocar(linhasRepC(), 0, cabecalho({ numeroRep: "" }))))).toEqual(["CAMPO_INVALIDO"]);
    expect(codigos(parse(trocar(linhasRepC(), 0, cabecalho({ numeroRep: " 123" }))))).toEqual(["CAMPO_INVALIDO"]);
    expect(parse(trocar(linhasRepC(), 0, cabecalho({ numeroRep: "99999999999999999" }))).inconsistencias).toEqual([]);
    expect(parse(trocar(linhasRepC(), 0, cabecalho({ numeroRep: "4000123" }))).inconsistencias).toEqual([]);
  });

  it("código do tipo 6 conferido contra o tipo de REP", () => {
    expect(codigos(parse(trocar(linhasRepC(), 10, tipo6(10, "07")), { tipoRep: "C" }))).toEqual(["CAMPO_INVALIDO"]);
    expect(parse(trocar(linhasRepC(), 10, tipo6(10, "01")), { tipoRep: "C" }).inconsistencias).toEqual([]);
    const repP = linhasRepP();
    expect(codigos(parse(trocar(repP, 3, tipo6(3, "01", "2026-10-01T09:00:00-0300"))))).toEqual(["CAMPO_INVALIDO"]);
  });
});

describe("P8-09: mensagens claras para BOM, CR solto e UTF-8", () => {
  const latin1 = (texto: string) => codificarLatin1(texto);
  it("BOM UTF-8 → só BOM_UTF8 (sem 'tipo desconhecido' nem 'cabeçalho ausente'), REJEITADA", () => {
    const bytes = montarAfd(linhasRepC());
    const comBom = new Uint8Array([0xef, 0xbb, 0xbf, ...bytes]);
    const r = parseAfd(comBom);
    expect(codigos(r)).toEqual(["BOM_UTF8"]);
    expect(r.inconsistencias[0].mensagem).toMatch(/BOM UTF-8/);
    expect(relatorioImportacao(r).status).toBe("REJEITADA");
  });

  it("só CR e CR CR LF → QUEBRA_CR_SOLTO, sem citar leiaute legado", () => {
    for (const quebra of ["\r", "\r\r\n"]) {
      const r = parse(linhasRepC(), undefined, quebra);
      expect(codigos(r), JSON.stringify(quebra)).toEqual(["QUEBRA_CR_SOLTO"]);
      expect(r.inconsistencias[0].mensagem).not.toMatch(/1510|legado/);
      expect(relatorioImportacao(r).status).toBe("REJEITADA");
    }
  });

  it("arquivo re-salvo em UTF-8 → ENCODING_UTF8, sem citar leiaute legado", () => {
    const texto = linhasRepC().map(l => l + "\r\n").join("");
    const utf8 = new TextEncoder().encode(texto);
    const r = parseAfd(utf8);
    expect(codigos(r)).toEqual(["ENCODING_UTF8"]);
    expect(r.inconsistencias[0].mensagem).toMatch(/UTF-8/);
    expect(r.inconsistencias[0].mensagem).not.toMatch(/1510|legado/);
    expect(relatorioImportacao(r).status).toBe("REJEITADA");
  });

  it("Latin-1 legítimo (acentos de 1 byte, bytes 0x80–0x9F) não é confundido com UTF-8", () => {
    expect(parse(linhasRepC()).inconsistencias).toEqual([]);
    const r = parseAfd(latin1("x\u0080\u009f\u00e7\r\n"));
    expect(codigos(r)).not.toContain("ENCODING_UTF8");
  });
});
