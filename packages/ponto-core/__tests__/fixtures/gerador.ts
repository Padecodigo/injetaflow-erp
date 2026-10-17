/**
 * Gerador de AFD **sintético** para os testes do ponto-core. Nenhum dado real: CPFs e CNPJs são gerados
 * a partir de bases fictícias com dígitos verificadores calculados aqui. O CRC usa `crc16KermitHex`, cujo
 * vetor oficial ("123456789" → "2189") é testado à parte.
 */
import { calcularHashTipo7 } from "../../src/cadeia-hash";
import { crc16KermitHex } from "../../src/crc16";
import { codificarLatin1 } from "../../src/latin1";

export const pad = (valor: string, tamanho: number) => {
  if (valor.length > tamanho) throw new Error(`"${valor}" excede ${tamanho} posições`);
  return valor.padEnd(tamanho, " ");
};
export const num = (valor: number, tamanho: number) => String(valor).padStart(tamanho, "0");
const comCrc = (corpo: string) => corpo + crc16KermitHex(corpo);

/** CPF sintético: 9 dígitos de base + DVs calculados. */
export function gerarCpf(base9: string): string {
  const dv = (base: string, peso: number) => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (peso - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  const d1 = dv(base9, 10);
  return base9 + d1 + dv(base9 + d1, 11);
}

/** CNPJ sintético (numérico ou alfanumérico): 12 caracteres de base + DVs calculados. */
export function gerarCnpj(base12: string): string {
  const dv = (base: string) => {
    let soma = 0;
    let peso = 2;
    for (let i = base.length - 1; i >= 0; i--) {
      soma += (base.charCodeAt(i) - 48) * peso;
      peso = peso === 9 ? 2 : peso + 1;
    }
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = dv(base12);
  return base12 + d1 + dv(base12 + d1);
}

export const CPF_A = gerarCpf("111444777");
export const CPF_B = gerarCpf("222555888");
export const CPF_RESP = gerarCpf("333666999");
export const CNPJ_EMPREGADOR = gerarCnpj("112223330001");
export const CNPJ_ALFANUMERICO = gerarCnpj("12ABC34501DE");
export const CNPJ_FABRICANTE = gerarCnpj("445556660001");

/** CPF em 12 posições nos dois formatos do FAQ 50. */
export const cpf12 = (cpf: string, formato: "zero" | "espaco" = "zero") => (formato === "zero" ? `0${cpf}` : `${cpf} `);

export interface OpcoesCabecalho {
  tpId?: string;
  id?: string;
  cno?: string;
  razao?: string;
  numeroRep?: string;
  dataInicial?: string;
  dataFinal?: string;
  geradoEm?: string;
  versao?: string;
  tpFab?: string;
  idFab?: string;
  modelo?: string;
}

export function cabecalho(o: OpcoesCabecalho = {}): string {
  return comCrc(
    "000000000" + "1" + (o.tpId ?? "1") + pad(o.id ?? CNPJ_EMPREGADOR, 14) + pad(o.cno ?? "", 14) +
    pad(o.razao ?? "Indústria Sintética de Injeção Ltda (FICTÍCIA)", 150) + pad(o.numeroRep ?? "00004000000123456", 17) +
    (o.dataInicial ?? "2026-10-01") + (o.dataFinal ?? "2026-10-31") + (o.geradoEm ?? "2026-10-17T15:00:00-0300") +
    (o.versao ?? "004") + (o.tpFab ?? "1") + pad(o.idFab ?? CNPJ_FABRICANTE, 14) + pad(o.modelo ?? "REP SINTETICO MODELO X", 30),
  );
}

export const tipo2 = (nsr: number, o: { dh?: string; cpfResp?: string; local?: string } = {}) =>
  comCrc(num(nsr, 9) + "2" + (o.dh ?? "2026-10-01T07:00:00-0300") + num(Number(o.cpfResp ?? CPF_RESP), 14) + "1" + pad(CNPJ_EMPREGADOR, 14) + pad("", 14) +
    pad("Indústria Sintética de Injeção Ltda (FICTÍCIA)", 150) + pad(o.local ?? "Galpão 1 · Rua Fictícia, 100", 100));

export const tipo3 = (nsr: number, dh: string, cpf: string, formato: "zero" | "espaco" = "zero") => comCrc(num(nsr, 9) + "3" + dh + cpf12(cpf, formato));

export const tipo4 = (nsr: number, antes: string, depois: string, cpfResp = CPF_RESP) => comCrc(num(nsr, 9) + "4" + antes + depois + cpfResp);

export const tipo5 = (nsr: number, o: { dh?: string; op?: string; cpf?: string; nome?: string; demais?: string; cpfResp?: string } = {}) =>
  comCrc(num(nsr, 9) + "5" + (o.dh ?? "2026-10-01T07:10:00-0300") + (o.op ?? "I") + cpf12(o.cpf ?? CPF_A) + pad(o.nome ?? "Trabalhador Fictício A", 52) +
    pad(o.demais ?? "", 4) + (o.cpfResp ?? CPF_RESP));

export const tipo6 = (nsr: number, codigo: string, dh = "2026-10-02T05:00:00-0300") => num(nsr, 9) + "6" + dh + codigo;

/** Tipo 7 com hash encadeado (mesma regra de `calcularHashTipo7`). Devolve a linha e o hash para o próximo. */
export function tipo7(nsr: number, o: { dh: string; cpf: string; gravado?: string; coletor?: string; offline?: "0" | "1"; hashAnterior?: string | null }) {
  const campos = num(nsr, 9) + "7" + o.dh + cpf12(o.cpf) + (o.gravado ?? o.dh) + (o.coletor ?? "02") + (o.offline ?? "0");
  const hash = calcularHashTipo7(campos, o.hashAnterior ?? null);
  return { linha: campos + hash, hash };
}

export const trailer = (q: Partial<Record<"2" | "3" | "4" | "5" | "6" | "7", number>>) =>
  "999999999" + num(q["2"] ?? 0, 9) + num(q["3"] ?? 0, 9) + num(q["4"] ?? 0, 9) + num(q["5"] ?? 0, 9) + num(q["6"] ?? 0, 9) + num(q["7"] ?? 0, 9) + "9";

export const assinaturaP7s = () => pad("ASSINATURA_DIGITAL_EM_ARQUIVO_P7S", 100);
/** REP-C grava a assinatura do próprio equipamento; aqui um conteúdo fictício de 100 posições. */
export const assinaturaRepC = () => pad("QVNTSU5BVFVSQS1TSU5URVRJQ0EtREUtVEVTVEUtTkFPLVZBTElEQQ==", 100);

export function montarAfd(linhas: readonly string[], quebra = "\r\n"): Uint8Array {
  return codificarLatin1(linhas.map(l => l + quebra).join(""));
}

/** AFD sintético de REP-C (tipos 1, 2, 3, 4, 5, 6, 9 + assinatura), com CPF nos dois formatos e fusos -0300/-0200. */
export function linhasRepC(): string[] {
  return [
    cabecalho(),
    tipo2(1),
    tipo5(2),
    tipo5(3, { cpf: CPF_B, nome: "Trabalhadora Fictícia B (São João)" }),
    tipo3(4, "2026-10-01T07:58:00-0300", CPF_A, "zero"),
    tipo3(5, "2026-10-01T08:01:00-0300", CPF_B, "espaco"),
    tipo3(6, "2026-10-01T12:00:00-0300", CPF_A),
    tipo3(7, "2026-10-01T13:00:00-0300", CPF_A),
    tipo4(8, "2026-10-01T16:00:00-0300", "2026-10-01T16:02:00-0300"),
    tipo3(9, "2026-10-01T18:00:00-0200", CPF_A),
    tipo6(10, "02"),
    trailer({ "2": 1, "3": 5, "4": 1, "5": 2, "6": 1 }),
    assinaturaRepC(),
  ];
}

/** AFD sintético de REP-P (tipos 1, 6, 7 com cadeia de hash, 9 + assinatura literal). */
export function linhasRepP(): string[] {
  const a = tipo7(1, { dh: "2026-10-01T08:00:00-0300", cpf: CPF_A, gravado: "2026-10-01T08:00:00-0300" });
  const b = tipo7(2, { dh: "2026-10-01T08:03:00-0300", cpf: CPF_B, gravado: "2026-10-01T08:10:00-0300", coletor: "01", offline: "1", hashAnterior: a.hash });
  const c = tipo7(4, { dh: "2026-10-01T17:00:00-0300", cpf: CPF_A, coletor: "02", hashAnterior: b.hash });
  return [
    cabecalho({ numeroRep: "5120220000001", modelo: "" }),
    a.linha,
    b.linha,
    tipo6(3, "07", "2026-10-01T09:00:00-0300"),
    c.linha,
    trailer({ "6": 1, "7": 3 }),
    assinaturaP7s(),
  ];
}
