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
  /** P8-01: registros retidos para o RH (nunca viram marcação válida). */
  quarentena: number | null;
  nsrsEmLacuna: number | null;
  /** P8-R2-01: NSRs inseridos que preencheram lacuna declarada (sempre com aviso; o status nunca fica OK). */
  lacunasPreenchidas: number | null;
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
 * Status: REJEITADA (`parse.motivosRejeicao`: vazio, encoding, leiaute, sem cabeçalho, empregador fora da empresa),
 * BLOQUEADA (retrocesso de NSR), SEM_NOVIDADES (nada novo, sem conflito nem quarentena), COM_ERROS (erro, conflito
 * ou quarentena), COM_AVISOS (aviso, lacuna, preenchimento de lacuna, análise de lacuna truncada) ou OK.
 */
export function relatorioImportacao<T extends LinhaParaDecisao>(parse: ResultadoParser, decisao?: DecisaoImportacao<T>): RelatorioImportacao {
  const porCodigo: Partial<Record<CodigoInconsistencia, number>> = {};
  for (const i of parse.inconsistencias) porCodigo[i.codigo] = (porCodigo[i.codigo] ?? 0) + 1;
  const conta = (c: CodigoInconsistencia) => porCodigo[c] ?? 0;
  const erros = parse.inconsistencias.filter(i => i.severidade === "erro").length;
  const avisos = parse.inconsistencias.length - erros;
  const rejeitada = parse.motivosRejeicao.length > 0 || parse.leiaute !== "671-004" || !parse.cabecalho;
  const quarentena = decisao ? decisao.quarentena.length : null;
  const nsrsEmLacuna = decisao ? decisao.lacunas.reduce((soma, l) => soma + (l.ate - l.de + 1), 0) : null;
  const lacunasPreenchidas = decisao ? decisao.lacunasPreenchidas.length : null;
  let status: StatusImportacao;
  if (rejeitada) status = "REJEITADA";
  else if (decisao?.bloqueada) status = "BLOQUEADA";
  else if (decisao && decisao.inserir.length === 0 && decisao.conflitos.length === 0 && decisao.quarentena.length === 0 && erros === 0) status = "SEM_NOVIDADES";
  else if (erros > 0 || (decisao?.conflitos.length ?? 0) > 0 || (quarentena ?? 0) > 0) status = "COM_ERROS";
  else if (avisos > 0 || (nsrsEmLacuna ?? 0) > 0 || (lacunasPreenchidas ?? 0) > 0 || decisao?.lacunasTruncadasEm !== undefined || decisao?.crcVerificavel === false) status = "COM_AVISOS";
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
    quarentena,
    nsrsEmLacuna,
    lacunasPreenchidas,
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
    if (decisao.crcVerificavel === false && !parse.inconsistencias.some(i => i.codigo === "CRC_NAO_VERIFICAVEL" || i.codigo === "CRC_INCONSISTENTE")) {
      lista.push({ codigo: "CRC_NAO_VERIFICAVEL", severidade: "aviso", mensagem: "Nenhum registro deste arquivo confere com o CRC-16/KERMIT (CRC de outro algoritmo). O CRC não foi usado para decidir o cursor; lacunas, reset e salto continuam conferidos." });
    }
    if (decisao.lacunasTruncadasEm !== undefined) {
      lista.push({ codigo: "NSR_LACUNA", severidade: "aviso", nsr: decisao.lacunasTruncadasEm, mensagem: `A análise de lacunas parou no NSR ${decisao.lacunasTruncadasEm - 1} (limite de 1 milhão de NSRs por importação); pode haver mais lacunas a partir do ${decisao.lacunasTruncadasEm}.` });
    }
    // P8-R2-01: preenchimentos de lacuna, agrupados em faixas contíguas
    const preenchidos = decisao.lacunasPreenchidas.map(x => x.nsr).sort((a, b) => a - b);
    for (let i = 0; i < preenchidos.length; ) {
      let j = i;
      while (j + 1 < preenchidos.length && preenchidos[j + 1] === preenchidos[j] + 1) j++;
      const de = preenchidos[i];
      const ate = preenchidos[j];
      lista.push({ codigo: "PREENCHIMENTO_DE_LACUNA", severidade: "aviso", nsr: de, mensagem: de === ate ? `NSR ${de} preencheu uma lacuna antiga deste REP (data e hora coerentes com os vizinhos). Confira se a re-coleta era esperada.` : `NSRs ${de} a ${ate} preencheram uma lacuna antiga deste REP (data e hora coerentes com os vizinhos). Confira se a re-coleta era esperada.` });
      i = j + 1;
    }
    const MENSAGENS: Partial<Record<CodigoInconsistencia, (nsr: number) => string>> = {
      NSR_ABAIXO_DO_CURSOR: nsr => `NSR ${nsr} está abaixo do último NSR importado deste REP e não existe na base: possível reset ou troca do relógio. Registro retido para o RH confirmar.`,
      LACUNA_INCOERENTE: nsr => `NSR ${nsr} preencheria uma lacuna antiga, mas a data e hora não fica entre as dos NSRs vizinhos já gravados: possível registro forjado ou relógio ajustado. Registro retido para o RH.`,
      NSR_SALTO_ANOMALO: nsr => `NSR ${nsr} salta muito acima do último NSR confiável deste REP: possível NSR corrompido. Registro retido para o RH e o cursor não avançou.`,
      ESTADO_INCOMPLETO: nsr => `NSR ${nsr} está na faixa já gravada deste REP, mas o sistema não informou o hash dele nem uma lacuna conhecida que o contenha. Registro retido; confira a base antes de reimportar.`,
    };
    for (const q of decisao.quarentena) {
      for (const motivo of q.motivos) {
        const msg = MENSAGENS[motivo];
        if (msg) lista.push({ codigo: motivo, severidade: "erro", nsr: q.registro.nsr, numeroLinha: q.registro.numeroLinha, mensagem: msg(q.registro.nsr) });
      }
    }
    if (decisao.quarentena.length > 0) {
      lista.push({ codigo: "NSR_QUARENTENA", severidade: "erro", mensagem: `${decisao.quarentena.length} registro(s) em quarentena (erro grave, NSR repetido com conteúdo diferente, abaixo do cursor, lacuna incoerente, salto anômalo ou estado incompleto). Não viraram marcação; ficam pendentes para o RH.` });
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
