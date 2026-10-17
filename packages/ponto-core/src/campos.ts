/**
 * Campos do AFD (leiaute AFD, item 6): N numérico, A alfanumérico, D "AAAA-MM-dd" e
 * DH "AAAA-MM-ddThh:mm:00ZZZZZ" (segundos fixos em 00, fuso com sinal, ex.: 2021-04-27T16:44:00-0300).
 * Todas as funções são puras e nunca lançam exceção: entrada inválida devolve `null`.
 */

/** Recorta um campo pelas posições do leiaute (1-indexadas, inclusivas). */
export function campo(linha: string, inicio: number, fim: number): string {
  return linha.slice(inicio - 1, fim);
}

/** Somente leitura: o parser compartilha o mesmo objeto (congelado) entre registros com a mesma data e hora. */
export interface DataHoraAfd {
  /** Texto original do arquivo (24 posições). */
  readonly texto: string;
  /** Instante normalizado em UTC (ISO 8601 com "Z"). */
  readonly utc: string;
  /** Fuso original, ex.: "-0300". */
  readonly fuso: string;
  /** Deslocamento do fuso em minutos (ex.: -180). */
  readonly offsetMinutos: number;
  /** Data local do registro no fuso original ("AAAA-MM-dd"). */
  readonly dataLocal: string;
  /** Segundos diferentes de "00" (o leiaute fixa 00). */
  readonly segundosNaoZero: boolean;
}

const RE_DH = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})([+-])(\d{2})(\d{2})$/;
const RE_D = /^(\d{4})-(\d{2})-(\d{2})$/;

function dataValida(ano: number, mes: number, dia: number): boolean {
  if (mes < 1 || mes > 12 || dia < 1) return false;
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  return d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

/** Campo D ("AAAA-MM-dd"). */
export function lerData(texto: string): string | null {
  const m = RE_D.exec(texto);
  if (!m) return null;
  return dataValida(Number(m[1]), Number(m[2]), Number(m[3])) ? texto : null;
}

/** Campo DH. Normaliza para UTC e preserva texto e fuso originais. */
export function lerDataHora(texto: string): DataHoraAfd | null {
  const m = RE_DH.exec(texto);
  if (!m) return null;
  const [ano, mes, dia, hora, minuto, segundo, fusoH, fusoM] = [m[1], m[2], m[3], m[4], m[5], m[6], m[8], m[9]].map(Number);
  if (!dataValida(ano, mes, dia) || hora > 23 || minuto > 59 || segundo > 59 || fusoH > 14 || fusoM > 59) return null;
  const sinal = m[7] === "-" ? -1 : 1;
  const offsetMinutos = sinal * (fusoH * 60 + fusoM);
  const utcMs = Date.UTC(ano, mes - 1, dia, hora, minuto, segundo) - offsetMinutos * 60_000;
  return {
    texto,
    utc: new Date(utcMs).toISOString(),
    fuso: `${m[7]}${m[8]}${m[9]}`,
    offsetMinutos: offsetMinutos === 0 ? 0 : offsetMinutos,
    dataLocal: `${m[1]}-${m[2]}-${m[3]}`,
    segundosNaoZero: segundo !== 0,
  };
}

/** Campo N de tamanho fixo, só dígitos. */
export function lerNumero(texto: string): number | null {
  return /^\d+$/.test(texto) ? Number(texto) : null;
}

/** Campo N opcional: só dígitos (alinhado à esquerda, completado com espaços) ou todo em branco. */
export function numericoOpcional(texto: string): string | null {
  const t = texto.trimEnd();
  if (t === "") return "";
  return /^\d+$/.test(t) ? t : null;
}

/** Dígitos verificadores de CPF (11 dígitos). Sequências repetidas são inválidas. */
export function cpfValido(cpf: string): boolean {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const dv = (base: string, pesoInicial: number) => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (pesoInicial - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return dv(cpf.slice(0, 9), 10) === Number(cpf[9]) && dv(cpf.slice(0, 10), 11) === Number(cpf[10]);
}

/**
 * CPF do empregado em 12 posições (tipos 3, 5 e 7). FAQ 50 da Portaria 671 aceita
 * "0XXXXXXXXXXX" (zero à esquerda) ou "XXXXXXXXXXX " (espaço à direita). Devolve os 11 dígitos.
 */
export function lerCpf12(texto: string): string | null {
  if (/^0\d{11}$/.test(texto)) return texto.slice(1);
  if (/^\d{11} $/.test(texto)) return texto.slice(0, 11);
  return null;
}

/**
 * CPF de responsável em campo N mais largo que 11 (tipo 2, 14 posições) ou exato (tipos 4 e 5, 11 posições).
 * Aceita zeros à esquerda ou alinhamento à esquerda com espaços **[a confirmar com amostras reais, D11]**.
 */
export function lerCpfResponsavel(texto: string): string | null {
  if (/^\d+$/.test(texto) && texto.length >= 11) {
    const excesso = texto.slice(0, texto.length - 11);
    return /^0*$/.test(excesso) ? texto.slice(-11) : null;
  }
  const t = texto.trimEnd();
  return /^\d{11}$/.test(t) ? t : null;
}

/**
 * CNPJ numérico ou alfanumérico (12 caracteres [0-9A-Z] + 2 dígitos verificadores).
 * DV pelo módulo 11 com o valor de cada caractere = código ASCII − 48 (regra da Receita Federal para o
 * CNPJ alfanumérico, que mantém o cálculo do CNPJ numérico).
 */
export function cnpjValido(cnpj: string): boolean {
  if (!/^[0-9A-Z]{12}\d{2}$/.test(cnpj) || /^(\d)\1{13}$/.test(cnpj)) return false;
  const valor = (c: string) => c.charCodeAt(0) - 48;
  const dv = (base: string) => {
    let soma = 0;
    let peso = 2;
    for (let i = base.length - 1; i >= 0; i--) {
      soma += valor(base[i]) * peso;
      peso = peso === 9 ? 2 : peso + 1;
    }
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const dv1 = dv(cnpj.slice(0, 12));
  const dv2 = dv(cnpj.slice(0, 12) + String(dv1));
  return dv1 === Number(cnpj[12]) && dv2 === Number(cnpj[13]);
}
