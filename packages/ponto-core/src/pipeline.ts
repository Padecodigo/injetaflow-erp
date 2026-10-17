/**
 * Decisão do pipeline de importação como função pura (plano v2, F1 e §3.3). Recebe o estado conhecido do REP
 * (último NSR e hash da linha por NSR já gravado) e as linhas lidas, e decide o que inserir. 100% determinística:
 * mesma entrada, mesma saída, na ordem do arquivo. Sem banco: quem chama carrega o estado e grava o resultado.
 */
export interface EstadoConhecido {
  /** Maior NSR já gravado para este REP (null se nunca importou). */
  ultimoNsr: number | null;
  /** Hash da linha bruta por NSR já gravado. */
  hashesPorNsr: ReadonlyMap<number, string> | Readonly<Record<number, string>>;
}

export interface LinhaParaDecisao {
  nsr: number;
  linhaHash: string;
}

export interface Conflito<T extends LinhaParaDecisao> {
  registro: T;
  hashExistente: string;
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
  /** Faixas de NSR ausentes (nem gravadas nem no arquivo) entre o último conhecido e o maior do arquivo. */
  lacunas: Lacuna[];
  /** Presente quando a sequência do REP voltou atrás (troca de equipamento ou reset). A importação fica bloqueada. */
  retrocesso?: Retrocesso;
  /** true quando nada pode ser inserido até o RH tratar (hoje: retrocesso). */
  bloqueada: boolean;
  /** Linhas que seriam inseridas, retidas porque a importação está bloqueada. */
  retidasPorBloqueio: T[];
}

function lerHash(mapa: EstadoConhecido["hashesPorNsr"], nsr: number): string | undefined {
  if (mapa instanceof Map) return mapa.get(nsr);
  return (mapa as Readonly<Record<number, string>>)[nsr];
}

function temHash(mapa: EstadoConhecido["hashesPorNsr"], nsr: number): boolean {
  return lerHash(mapa, nsr) !== undefined;
}

/**
 * Regras:
 * - NSR já gravado com o mesmo hash → duplicada (ignora e conta).
 * - NSR já gravado com hash diferente → conflito (nunca sobrescreve).
 * - NSR repetido dentro do próprio arquivo → comparado com a primeira ocorrência (duplicada ou conflito).
 * - NSR novo → inserir.
 * - Lacunas: NSRs entre `ultimoNsr + 1` (ou o menor do arquivo, na primeira importação) e o maior do arquivo
 *   que não estão nem gravados nem no arquivo.
 * - Retrocesso: o menor NSR do arquivo está em conflito com o já gravado, abaixo ou igual ao último NSR conhecido.
 *   Indica que a sequência recomeçou (outro equipamento ou reset). Bloqueia toda a inserção até o RH cadastrar ou
 *   confirmar um novo REP. Conflito isolado no meio do arquivo não bloqueia: só ele vai para `conflitos`.
 */
export function decidirImportacao<T extends LinhaParaDecisao>(estado: EstadoConhecido, linhas: readonly T[]): DecisaoImportacao<T> {
  const inserir: T[] = [];
  const duplicadas: T[] = [];
  const conflitos: Conflito<T>[] = [];
  const noArquivo = new Map<number, string>();

  for (const linha of linhas) {
    const hash = linha.linhaHash.toLowerCase();
    const gravado = lerHash(estado.hashesPorNsr, linha.nsr)?.toLowerCase() ?? noArquivo.get(linha.nsr);
    if (gravado === undefined) {
      inserir.push(linha);
      noArquivo.set(linha.nsr, hash);
    } else if (gravado === hash) {
      duplicadas.push(linha);
    } else {
      conflitos.push({ registro: linha, hashExistente: gravado });
    }
  }

  const nsrs = linhas.map(l => l.nsr);
  const lacunas: Lacuna[] = [];
  let retrocesso: Retrocesso | undefined;
  if (nsrs.length > 0) {
    const menor = Math.min(...nsrs);
    const maior = Math.max(...nsrs);
    const presentes = new Set(nsrs);
    let aberta: number | null = null;
    // Só olha para frente do último NSR conhecido (ou do menor do arquivo); limite defensivo de 1 milhão de NSRs por análise.
    const comeco = estado.ultimoNsr !== null ? estado.ultimoNsr + 1 : menor;
    const fim = Math.min(maior, comeco + 1_000_000);
    for (let n = comeco; n <= fim; n++) {
      const existe = presentes.has(n) || temHash(estado.hashesPorNsr, n);
      if (!existe && aberta === null) aberta = n;
      if (existe && aberta !== null) {
        lacunas.push({ de: aberta, ate: n - 1 });
        aberta = null;
      }
    }
    if (aberta !== null) lacunas.push({ de: aberta, ate: fim });

    const primeiro = linhas.find(l => l.nsr === menor)!;
    const primeiroEmConflito = conflitos.some(c => c.registro === primeiro);
    if (estado.ultimoNsr !== null && menor <= estado.ultimoNsr && primeiroEmConflito) {
      retrocesso = { ultimoNsr: estado.ultimoNsr, primeiroNsrArquivo: menor, maiorNsrArquivo: maior };
    }
  }

  const bloqueada = retrocesso !== undefined;
  return { inserir: bloqueada ? [] : inserir, duplicadas, conflitos, lacunas, ...(retrocesso ? { retrocesso } : {}), bloqueada, retidasPorBloqueio: bloqueada ? inserir : [] };
}
