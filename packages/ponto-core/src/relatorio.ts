import type { DecisaoImportacao, LinhaParaDecisao } from "./pipeline";
import type { CodigoInconsistencia, Inconsistencia, ResultadoParser, TipoRegistroComNsr } from "./tipos";

export type StatusImportacao = "OK" | "COM_AVISOS" | "COM_ERROS" | "SEM_NOVIDADES" | "BLOQUEADA" | "REJEITADA";

export interface RelatorioImportacao {
  status: StatusImportacao;
  sha256Arquivo: string;
  linhasLidas: number;
  registrosPorTipo: Record<TipoRegistroComNsr, number>;
  marcacoes: number;
  invalidas: number;
  novas: number | null;
  duplicadas: number | null;
  conflitos: number | null;
  nsrsEmLacuna: number | null;
  retidasPorBloqueio: number | null;
  crcInvalido: number;
  cadeiaHashInvalida: number;
  trailerDivergente: number;
  cpfInvalido: number;
  erros: number;
  avisos: number;
  porCodigo: Partial<Record<CodigoInconsistencia, number>>;
}

/**
 * Relatório de inconsistências por importação (plano v2, §3.3): lidas, novas, duplicadas, conflitos, inválidas,
 * lacunas, CRC, cadeia de hash, trailer. Sem a decisão do pipeline, os campos dependentes do estado ficam `null`.
 * Status: REJEITADA (leiaute não suportado, arquivo vazio, sem cabeçalho), BLOQUEADA (retrocesso de NSR),
 * SEM_NOVIDADES (nada novo nem conflito), COM_ERROS, COM_AVISOS ou OK.
 */
export function relatorioImportacao<T extends LinhaParaDecisao>(parse: ResultadoParser, decisao?: DecisaoImportacao<T>): RelatorioImportacao {
  const porCodigo: Partial<Record<CodigoInconsistencia, number>> = {};
  for (const i of parse.inconsistencias) porCodigo[i.codigo] = (porCodigo[i.codigo] ?? 0) + 1;
  const conta = (c: CodigoInconsistencia) => porCodigo[c] ?? 0;
  const erros = parse.inconsistencias.filter(i => i.severidade === "erro").length;
  const avisos = parse.inconsistencias.length - erros;
  const rejeitada = parse.leiaute !== "671-004" || !parse.cabecalho;
  const nsrsEmLacuna = decisao ? decisao.lacunas.reduce((soma, l) => soma + (l.ate - l.de + 1), 0) : null;
  let status: StatusImportacao;
  if (rejeitada) status = "REJEITADA";
  else if (decisao?.bloqueada) status = "BLOQUEADA";
  else if (decisao && decisao.inserir.length === 0 && decisao.conflitos.length === 0 && erros === 0) status = "SEM_NOVIDADES";
  else if (erros > 0 || (decisao?.conflitos.length ?? 0) > 0) status = "COM_ERROS";
  else if (avisos > 0 || (nsrsEmLacuna ?? 0) > 0) status = "COM_AVISOS";
  else status = "OK";
  return {
    status,
    sha256Arquivo: parse.sha256Arquivo,
    linhasLidas: parse.totalLinhas,
    registrosPorTipo: { ...parse.contagemPorTipo },
    marcacoes: parse.registros.filter(r => r.tipo === "3" || r.tipo === "7").length,
    invalidas: parse.invalidas.length,
    novas: decisao ? decisao.inserir.length : null,
    duplicadas: decisao ? decisao.duplicadas.length : null,
    conflitos: decisao ? decisao.conflitos.length : null,
    nsrsEmLacuna,
    retidasPorBloqueio: decisao ? decisao.retidasPorBloqueio.length : null,
    crcInvalido: conta("CRC_INVALIDO"),
    cadeiaHashInvalida: conta("HASH_CADEIA_INVALIDA"),
    trailerDivergente: conta("TRAILER_DIVERGENTE"),
    cpfInvalido: conta("CPF_INVALIDO"),
    erros,
    avisos,
    porCodigo,
  };
}

/**
 * Inconsistências da importação, inclusive as do pipeline (conflitos, lacunas, retrocesso), numa lista única
 * para tela e CSV. As mensagens nunca trazem CPF.
 */
export function inconsistenciasDaImportacao<T extends LinhaParaDecisao & { numeroLinha?: number }>(parse: ResultadoParser, decisao?: DecisaoImportacao<T>): Inconsistencia[] {
  const lista = [...parse.inconsistencias];
  if (decisao) {
    for (const c of decisao.conflitos) {
      lista.push({ codigo: "NSR_CONFLITO", severidade: "erro", nsr: c.registro.nsr, numeroLinha: c.registro.numeroLinha, mensagem: `NSR ${c.registro.nsr} já importado com conteúdo diferente; o registro original não foi alterado.` });
    }
    for (const l of decisao.lacunas) {
      lista.push({ codigo: "NSR_LACUNA", severidade: "aviso", nsr: l.de, mensagem: l.de === l.ate ? `NSR ${l.de} ausente; colete de novo a partir dele.` : `NSRs ${l.de} a ${l.ate} ausentes; colete de novo a partir do ${l.de}.` });
    }
    if (decisao.retrocesso) {
      const r = decisao.retrocesso;
      lista.push({ codigo: "NSR_RETROCESSO", severidade: "erro", nsr: r.primeiroNsrArquivo, mensagem: `A sequência de NSR voltou (arquivo começa em ${r.primeiroNsrArquivo}, último conhecido ${r.ultimoNsr}). Importação bloqueada até o RH cadastrar ou confirmar o REP.` });
    }
  }
  return lista;
}

/** CSV (separador ";", BOM UTF-8, proteção contra injeção de fórmula), no mesmo padrão de `server/erp/csv.ts`. */
export function inconsistenciasCsv(lista: readonly Inconsistencia[]): string {
  const escapar = (valor: string | number | undefined) => {
    if (valor === undefined) return "";
    let texto = String(valor);
    if (/^[=+\-@\t\r]/.test(texto) && !/^-?\d+([.,]\d+)?$/.test(texto)) texto = `'${texto}`;
    return /[";\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
  };
  const linhas = [["Linha", "NSR", "Código", "Severidade", "Campo", "Mensagem"].join(";")];
  for (const i of lista) linhas.push([i.numeroLinha, i.nsr, i.codigo, i.severidade, i.campo, i.mensagem].map(escapar).join(";"));
  return `\uFEFF${linhas.join("\r\n")}\r\n`;
}
