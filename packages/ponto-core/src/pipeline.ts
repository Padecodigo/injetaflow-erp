import type { CodigoInconsistencia, ResultadoParser } from "./tipos";

/**
 * Decisão do pipeline de importação como função pura (plano v2, F1 e §3.3). Recebe o estado conhecido do REP
 * e as linhas lidas, e decide o que inserir, o que é duplicata, conflito ou quarentena. 100% determinística:
 * mesma entrada, mesma saída, na ordem do arquivo. Sem banco: quem chama carrega o estado e grava o resultado.
 *
 * Contrato para a F2 (ver README): `hashesPorNsr` precisa trazer o hash de TODO NSR já gravado dentro da
 * faixa [menor, maior] NSR do arquivo (não só acima do cursor), e `primeiroNsr` o menor NSR já gravado do REP.
 */
export interface EstadoConhecido {
  /** Maior NSR já gravado para este REP (null se nunca importou). */
  ultimoNsr: number | null;
  /**
   * Menor NSR já gravado para este REP (null/ausente se desconhecido). Um NSR ausente entre `primeiroNsr` e
   * `ultimoNsr` preenche uma lacuna (re-coleta) e é inserido; abaixo de `primeiroNsr` (ou sem essa informação)
   * vai para quarentena como `NSR_ABAIXO_DO_CURSOR` (P8-03).
   */
  primeiroNsr?: number | null;
  /** Hash da linha bruta por NSR já gravado (toda a faixa do arquivo). */
  hashesPorNsr: ReadonlyMap<number, string> | Readonly<Record<number, string>>;
}

export interface LinhaParaDecisao {
  nsr: number;
  linhaHash: string;
  /** Códigos de inconsistência de severidade "erro" do próprio registro (o parser preenche). */
  errosGraves?: readonly CodigoInconsistencia[];
}

export interface Conflito<T extends LinhaParaDecisao> {
  registro: T;
  hashExistente: string;
}

/** Registro retido para o RH: nunca vira marcação válida e nunca é descartado (gravar como pendência). */
export interface Quarentena<T extends LinhaParaDecisao> {
  registro: T;
  motivos: CodigoInconsistencia[];
}

export interface Lacuna {
  de: number;
  ate: number;
}

export interface Retrocesso {
  ultimoNsr: number;
  primeiroNsrArquivo: number;
  maiorNsrArquivo: number;
}

export interface DecisaoImportacao<T extends LinhaParaDecisao> {
  inserir: T[];
  duplicadas: T[];
  conflitos: Conflito<T>[];
  /** P8-01/P8-03/P8-07: registros com erro grave, NSR abaixo do cursor ou NSR repetido com conteúdo diferente. */
  quarentena: Quarentena<T>[];
  /** Faixas de NSR ausentes (nem gravadas nem no arquivo) entre o último conhecido e o maior do arquivo. */
  lacunas: Lacuna[];
  /** Presente quando a sequência do REP voltou atrás (troca de equipamento ou reset). A importação fica bloqueada. */
  retrocesso?: Retrocesso;
  /** true quando nada pode ser inserido até o RH tratar (retrocesso ou arquivo rejeitado). */
  bloqueada: boolean;
  /** Linhas que seriam inseridas, retidas porque a importação está bloqueada. */
  retidasPorBloqueio: T[];
}

export interface OpcoesDecisao {
  /** Arquivo rejeitado (ex.: empregador fora da empresa, leiaute não suportado): tudo vai para quarentena. */
  rejeitarArquivo?: CodigoInconsistencia;
}

/** Erros que o próprio pipeline trata (não levam o registro à quarentena só por existirem). */
const TRATADOS_NO_PIPELINE = new Set<CodigoInconsistencia>(["NSR_DUPLICADO_NO_ARQUIVO"]);

function lerHash(mapa: EstadoConhecido["hashesPorNsr"], nsr: number): string | undefined {
  const v = mapa instanceof Map ? mapa.get(nsr) : (mapa as Readonly<Record<number, string>>)[nsr];
  return v === undefined ? undefined : v.toLowerCase();
}

/**
 * Regras:
 * - Erro grave no registro (CRC inválido em REP-A/P, data e hora inválida, CPF ilegível, cadeia de hash inválida
 *   quando configurada como erro, NSR fora de ordem, NSR 0...) → quarentena (P8-01). Nunca vai para `inserir`.
 * - NSR repetido no arquivo com conteúdos diferentes → todas as ocorrências em quarentena (P8-07). Repetido
 *   idêntico → a primeira segue as regras e as demais são duplicadas.
 * - NSR já gravado com o mesmo hash → duplicada. Com hash diferente → conflito (nunca sobrescreve).
 * - NSR novo acima do último conhecido → inserir. NSR novo abaixo do último conhecido: preenche lacuna se estiver
 *   entre `primeiroNsr` e `ultimoNsr`; senão quarentena `NSR_ABAIXO_DO_CURSOR` (possível reset/troca do REP, P8-03).
 * - Lacunas: NSRs entre `ultimoNsr + 1` (ou o menor do arquivo, na primeira importação) e o maior do arquivo
 *   que não estão nem gravados nem no arquivo.
 * - Retrocesso (P8-06): o menor NSR do arquivo está em conflito, nenhum NSR do arquivo coincide com o já gravado
 *   (nenhuma duplicata) e há pelo menos 2 conflitos seguidos no início ou o arquivo inteiro está abaixo do cursor.
 *   Bloqueia toda a inserção. Conflito isolado (inclusive no primeiro NSR) não bloqueia: só ele vai para `conflitos`.
 *
 * Sem `Math.min(...spread)` nem recursão: linear no tamanho do arquivo (P8-02).
 */
export function decidirImportacao<T extends LinhaParaDecisao>(estado: EstadoConhecido, linhas: readonly T[], opcoes: OpcoesDecisao = {}): DecisaoImportacao<T> {
  const inserir: T[] = [];
  const duplicadas: T[] = [];
  const conflitos: Conflito<T>[] = [];
  const quarentena: Quarentena<T>[] = [];
  const lacunas: Lacuna[] = [];

  if (opcoes.rejeitarArquivo) {
    for (const linha of linhas) quarentena.push({ registro: linha, motivos: [opcoes.rejeitarArquivo] });
    return { inserir, duplicadas, conflitos, quarentena, lacunas, bloqueada: true, retidasPorBloqueio: [] };
  }

  // 1ª passada: hashes por NSR dentro do arquivo, menor e maior NSR (laço, sem spread)
  const hashesNoArquivo = new Map<number, Set<string>>();
  let menor = Number.POSITIVE_INFINITY;
  let maior = Number.NEGATIVE_INFINITY;
  for (const linha of linhas) {
    const h = linha.linhaHash.toLowerCase();
    const s = hashesNoArquivo.get(linha.nsr);
    if (s) s.add(h);
    else hashesNoArquivo.set(linha.nsr, new Set([h]));
    if (linha.nsr < menor) menor = linha.nsr;
    if (linha.nsr > maior) maior = linha.nsr;
  }

  const primeiroNsr = estado.primeiroNsr ?? null;
  const processados = new Map<number, string>();
  let duplicadasDoEstado = 0;
  for (const linha of linhas) {
    const hash = linha.linhaHash.toLowerCase();
    const motivos: CodigoInconsistencia[] = [];
    if ((hashesNoArquivo.get(linha.nsr)?.size ?? 0) > 1) motivos.push("NSR_DUPLICADO_NO_ARQUIVO");
    for (const c of linha.errosGraves ?? []) if (!TRATADOS_NO_PIPELINE.has(c) && !motivos.includes(c)) motivos.push(c);

    const gravado = lerHash(estado.hashesPorNsr, linha.nsr);
    const jaNoArquivo = processados.get(linha.nsr);
    if (gravado !== undefined && gravado === hash && !motivos.includes("NSR_DUPLICADO_NO_ARQUIVO")) {
      // mesma linha já gravada: duplicata, mesmo que tenha avisos ou erros (não grava nada de novo)
      duplicadas.push(linha);
      duplicadasDoEstado++;
      continue;
    }
    if (gravado !== undefined && gravado !== hash && !motivos.includes("NSR_DUPLICADO_NO_ARQUIVO")) {
      conflitos.push({ registro: linha, hashExistente: gravado });
      continue;
    }
    if (motivos.length === 0 && jaNoArquivo !== undefined) {
      // repetição idêntica dentro do arquivo
      duplicadas.push(linha);
      continue;
    }
    if (motivos.length === 0 && estado.ultimoNsr !== null && linha.nsr < estado.ultimoNsr) {
      const preencheLacuna = primeiroNsr !== null && linha.nsr > primeiroNsr;
      if (!preencheLacuna) motivos.push("NSR_ABAIXO_DO_CURSOR");
    }
    if (motivos.length > 0) {
      quarentena.push({ registro: linha, motivos });
      processados.set(linha.nsr, hash);
      continue;
    }
    inserir.push(linha);
    processados.set(linha.nsr, hash);
  }

  let retrocesso: Retrocesso | undefined;
  if (linhas.length > 0) {
    let aberta: number | null = null;
    // Só olha para frente do último NSR conhecido (ou do menor do arquivo); limite defensivo de 1 milhão de NSRs por análise.
    const comeco = estado.ultimoNsr !== null ? estado.ultimoNsr + 1 : menor;
    const fim = Math.min(maior, comeco + 1_000_000);
    for (let n = comeco; n <= fim; n++) {
      const existe = hashesNoArquivo.has(n) || lerHash(estado.hashesPorNsr, n) !== undefined;
      if (!existe && aberta === null) aberta = n;
      if (existe && aberta !== null) {
        lacunas.push({ de: aberta, ate: n - 1 });
        aberta = null;
      }
    }
    if (aberta !== null) lacunas.push({ de: aberta, ate: fim });

    if (estado.ultimoNsr !== null && menor <= estado.ultimoNsr && duplicadasDoEstado === 0) {
      // conflitos seguidos a partir do menor NSR do arquivo (em ordem de NSR)
      const emConflito = new Set(conflitos.map(c => c.registro.nsr));
      let seguidos = 0;
      for (let n = menor; n <= maior && emConflito.has(n); n++) seguidos++;
      if (seguidos >= 2 || (seguidos >= 1 && maior <= estado.ultimoNsr)) {
        retrocesso = { ultimoNsr: estado.ultimoNsr, primeiroNsrArquivo: menor, maiorNsrArquivo: maior };
      }
    }
  }

  const bloqueada = retrocesso !== undefined;
  return {
    inserir: bloqueada ? [] : inserir,
    duplicadas,
    conflitos,
    quarentena,
    lacunas,
    ...(retrocesso ? { retrocesso } : {}),
    bloqueada,
    retidasPorBloqueio: bloqueada ? inserir : [],
  };
}

/**
 * Atalho recomendado para a F2: decide a importação a partir do resultado do parser. Se o arquivo foi rejeitado
 * (leiaute, encoding, empregador fora da empresa...), tudo vai para quarentena e nada é inserido.
 */
export function planejarImportacao(estado: EstadoConhecido, parse: ResultadoParser): DecisaoImportacao<ResultadoParser["registros"][number]> {
  return decidirImportacao(estado, parse.registros, parse.motivosRejeicao.length > 0 ? { rejeitarArquivo: parse.motivosRejeicao[0] } : {});
}
