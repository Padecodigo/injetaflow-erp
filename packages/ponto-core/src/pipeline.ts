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
  /**
   * Cursor do REP: maior NSR CONFIÁVEL já gravado (null se nunca importou). A F2 deve persistir
   * `decisao.novoUltimoNsr` (que nunca avança por registro com CRC inválido nem em quarentena, P8-R2-02) e não
   * recalcular como "maior NSR da tabela".
   */
  ultimoNsr: number | null;
  /** Menor NSR já gravado para este REP (null/ausente se desconhecido). Abaixo dele: `NSR_ABAIXO_DO_CURSOR`. */
  primeiroNsr?: number | null;
  /**
   * Hash da linha bruta por NSR já gravado: todo NSR gravado entre o menor e o maior NSR do arquivo, mais os
   * vizinhos de cada lacuna declarada que o arquivo toca (`de - 1` e `ate + 1`).
   */
  hashesPorNsr: ReadonlyMap<number, string> | Readonly<Record<number, string>>;
  /**
   * P8-R2-01: instante (ms UTC, `instanteSequencial` do registro) por NSR gravado. Obrigatório pelo menos para os
   * vizinhos de cada lacuna declarada que o arquivo toca (`de - 1` e `ate + 1`). Sem ele o preenchimento não é
   * verificável e vai para quarentena (`ESTADO_INCOMPLETO`).
   */
  instantesPorNsr?: ReadonlyMap<number, number> | Readonly<Record<number, number>>;
  /**
   * P8-R2-03: faixas de NSR que a F2 sabe que faltam (as `lacunas` de importações anteriores, menos o que já foi
   * preenchido), sempre entre `primeiroNsr` e `ultimoNsr`. Só NSR dentro de uma lacuna declarada pode entrar abaixo
   * do cursor; NSR ≤ `ultimoNsr` sem hash e fora delas indica estado incompleto (`ESTADO_INCOMPLETO`).
   */
  lacunasConhecidas?: readonly Lacuna[];
}

export interface LinhaParaDecisao {
  nsr: number;
  linhaHash: string;
  /** Códigos de inconsistência de severidade "erro" do próprio registro (o parser preenche). */
  errosGraves?: readonly CodigoInconsistencia[];
  /** Todos os códigos do registro (o parser preenche). `CRC_INVALIDO`, mesmo como aviso, impede avançar o cursor. */
  problemas?: readonly CodigoInconsistencia[];
  /** Instante (ms UTC) do registro na sequência do REP (o parser preenche). Necessário para preencher lacuna. */
  instante?: number | null;
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
  /** Registros retidos para o RH: erro grave, NSR repetido com conteúdo diferente, abaixo do cursor, lacuna incoerente, salto anômalo, estado incompleto. */
  quarentena: Quarentena<T>[];
  /** P8-R2-01: subconjunto de `inserir` que preenche lacuna declarada (gera aviso `PREENCHIMENTO_DE_LACUNA`). */
  lacunasPreenchidas: T[];
  /** Faixas de NSR ausentes (nem gravadas nem no arquivo) entre o último conhecido e o maior NSR confiável do arquivo. */
  lacunas: Lacuna[];
  /** Presente quando a análise de lacunas foi cortada no limite defensivo (1 milhão de NSRs): NSR a partir do qual não se analisou. */
  lacunasTruncadasEm?: number;
  /** Presente quando a sequência do REP voltou atrás (troca de equipamento ou reset). A importação fica bloqueada. */
  retrocesso?: Retrocesso;
  /** true quando nada pode ser inserido até o RH tratar (retrocesso ou arquivo rejeitado). */
  bloqueada: boolean;
  /** Linhas que seriam inseridas, retidas porque a importação está bloqueada. */
  retidasPorBloqueio: T[];
  /**
   * P8-R2-02: cursor a persistir depois de gravar `inserir`: maior entre `estado.ultimoNsr` e os NSRs inseridos sem
   * `CRC_INVALIDO`. Registro com CRC inválido ou em quarentena nunca avança o cursor.
   */
  novoUltimoNsr: number | null;
}

/** Padrão de `limiteSaltoNsr` (P8-R2-02). */
export const LIMITE_SALTO_NSR_PADRAO = 10_000;
/** Padrão de `toleranciaLacunaMs` (P8-R2-01): 10 minutos. */
export const TOLERANCIA_LACUNA_MS_PADRAO = 10 * 60 * 1000;
const LIMITE_ANALISE_LACUNAS = 1_000_000;

export interface OpcoesDecisao {
  /** Arquivo rejeitado (ex.: empregador fora da empresa, leiaute não suportado): tudo vai para quarentena. */
  rejeitarArquivo?: CodigoInconsistencia;
  /**
   * P8-R2-02: maior salto aceito entre um NSR novo e o último NSR confiável (do estado ou do próprio arquivo).
   * Acima disso o registro vai para quarentena com `NSR_SALTO_ANOMALO`. Padrão `LIMITE_SALTO_NSR_PADRAO` (10.000).
   */
  limiteSaltoNsr?: number;
  /**
   * P8-R2-01: folga na coerência cronológica do preenchimento de lacuna:
   * instante(anterior) − tolerância ≤ instante(NSR) ≤ instante(posterior) + tolerância.
   * Padrão `TOLERANCIA_LACUNA_MS_PADRAO` (10 min, cobre ajuste fino do relógio entre os vizinhos).
   */
  toleranciaLacunaMs?: number;
}

/** Erros que o próprio pipeline trata (não levam o registro à quarentena só por existirem). */
const TRATADOS_NO_PIPELINE = new Set<CodigoInconsistencia>(["NSR_DUPLICADO_NO_ARQUIVO"]);

function lerMapa<V>(mapa: ReadonlyMap<number, V> | Readonly<Record<number, V>> | undefined, nsr: number): V | undefined {
  if (!mapa) return undefined;
  return mapa instanceof Map ? mapa.get(nsr) : (mapa as Readonly<Record<number, V>>)[nsr];
}

function lerHash(mapa: EstadoConhecido["hashesPorNsr"], nsr: number): string | undefined {
  const v = lerMapa(mapa, nsr);
  return v === undefined ? undefined : v.toLowerCase();
}

/** Lacunas declaradas, ordenadas, recortadas a (primeiroNsr, ultimoNsr) — o próprio `ultimoNsr` nunca é lacuna. */
function normalizarLacunas(estado: EstadoConhecido): Lacuna[] {
  const ultimo = estado.ultimoNsr;
  if (ultimo === null || !estado.lacunasConhecidas) return [];
  const primeiro = estado.primeiroNsr ?? null;
  const lista: Lacuna[] = [];
  for (const l of estado.lacunasConhecidas) {
    const de = Math.max(l.de, primeiro !== null ? primeiro + 1 : 1);
    const ate = Math.min(l.ate, ultimo - 1);
    if (Number.isInteger(de) && Number.isInteger(ate) && de <= ate) lista.push({ de, ate });
  }
  lista.sort((x, y) => x.de - y.de);
  return lista;
}

function acharLacuna(lacunas: readonly Lacuna[], nsr: number): number {
  let lo = 0;
  let hi = lacunas.length - 1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (nsr < lacunas[m].de) hi = m - 1;
    else if (nsr > lacunas[m].ate) lo = m + 1;
    else return m;
  }
  return -1;
}

/**
 * Regras:
 * - Erro grave no registro (CRC inválido em REP-A/P, data e hora inválida, CPF ilegível, cadeia de hash inválida
 *   quando configurada como erro, NSR fora de ordem, NSR 0, marcação sob outro empregador...) → quarentena (P8-01).
 * - NSR repetido no arquivo com conteúdos diferentes → todas as ocorrências em quarentena (P8-07). Repetido
 *   idêntico → a primeira segue as regras e as demais são duplicadas.
 * - NSR já gravado com o mesmo hash → duplicada. Com hash diferente → conflito (nunca sobrescreve).
 * - NSR novo acima do cursor → inserir, salvo salto maior que `limiteSaltoNsr` sobre o último NSR confiável →
 *   quarentena `NSR_SALTO_ANOMALO` (P8-R2-02). O cursor interno só avança por registro aceito e sem `CRC_INVALIDO`.
 * - NSR novo ≤ cursor (P8-R2-01/P8-R2-03):
 *   - dentro de uma lacuna declarada (`lacunasConhecidas`) → preenchimento: entra só se o instante for coerente com
 *     os vizinhos gravados (`de-1` e `ate+1`) e com o preenchimento anterior da mesma lacuna no arquivo, na
 *     tolerância; senão `LACUNA_INCOERENTE`. Sem hash ou instante dos vizinhos → `ESTADO_INCOMPLETO`;
 *   - fora de lacuna declarada, entre `primeiroNsr` e `ultimoNsr` (inclusive) → `ESTADO_INCOMPLETO` (o estado diz
 *     que está gravado, mas não trouxe o hash);
 *   - abaixo de `primeiroNsr` (ou sem essa informação) → `NSR_ABAIXO_DO_CURSOR` (possível reset/troca do REP, P8-03).
 * - Lacunas: NSRs entre `ultimoNsr + 1` (ou o menor do arquivo) e o maior NSR confiável do arquivo que não estão nem
 *   gravados nem no arquivo. A análise para em 1 milhão de NSRs e informa `lacunasTruncadasEm`.
 * - Retrocesso (P8-06): o menor NSR do arquivo está em conflito, nenhuma duplicata e ≥ 2 conflitos seguidos no
 *   início ou o arquivo inteiro abaixo do cursor. Bloqueia toda a inserção.
 *
 * Sem `Math.min(...spread)` nem recursão: linear no tamanho do arquivo (P8-02).
 */
export function decidirImportacao<T extends LinhaParaDecisao>(estado: EstadoConhecido, linhas: readonly T[], opcoes: OpcoesDecisao = {}): DecisaoImportacao<T> {
  const inserir: T[] = [];
  const duplicadas: T[] = [];
  const conflitos: Conflito<T>[] = [];
  const quarentena: Quarentena<T>[] = [];
  const lacunasPreenchidas: T[] = [];
  const lacunas: Lacuna[] = [];
  const limiteSalto = opcoes.limiteSaltoNsr ?? LIMITE_SALTO_NSR_PADRAO;
  const tolerancia = opcoes.toleranciaLacunaMs ?? TOLERANCIA_LACUNA_MS_PADRAO;

  if (opcoes.rejeitarArquivo) {
    for (const linha of linhas) quarentena.push({ registro: linha, motivos: [opcoes.rejeitarArquivo] });
    return { inserir, duplicadas, conflitos, quarentena, lacunasPreenchidas, lacunas, bloqueada: true, retidasPorBloqueio: [], novoUltimoNsr: estado.ultimoNsr };
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
  const ultimoNsr = estado.ultimoNsr;
  const lacunasDeclaradas = normalizarLacunas(estado);
  const ultimoPreenchimento = new Map<number, number>(); // índice da lacuna → instante do último preenchimento aceito
  const processados = new Map<number, string>();
  let duplicadasDoEstado = 0;
  // cursor interno (P8-R2-02): último NSR confiável visto (estado ou registro aceito sem CRC inválido)
  let cursor: number | null = ultimoNsr;
  let novoUltimoNsr: number | null = ultimoNsr;
  const confiavel = (linha: T) => !(linha.problemas ?? []).includes("CRC_INVALIDO");
  const avancar = (linha: T) => {
    if (!confiavel(linha)) return;
    if (cursor === null || linha.nsr > cursor) cursor = linha.nsr;
  };

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
      avancar(linha);
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
    // salto anômalo: avaliado mesmo que o registro já tenha outro motivo (o RH vê as duas causas)
    if (cursor !== null && linha.nsr > cursor && linha.nsr - cursor > limiteSalto) motivos.push("NSR_SALTO_ANOMALO");
    let preenche = false;
    if (motivos.length === 0 && ultimoNsr !== null && linha.nsr <= ultimoNsr) {
      const idx = acharLacuna(lacunasDeclaradas, linha.nsr);
      if (idx >= 0) {
        const motivo = coerenciaDoPreenchimento(estado, lacunasDeclaradas[idx], linha, tolerancia, ultimoPreenchimento.get(idx));
        if (motivo) motivos.push(motivo);
        else {
          preenche = true;
          ultimoPreenchimento.set(idx, linha.instante as number);
        }
      } else if (primeiroNsr !== null && linha.nsr >= primeiroNsr) {
        motivos.push("ESTADO_INCOMPLETO");
      } else {
        motivos.push("NSR_ABAIXO_DO_CURSOR");
      }
    }
    if (motivos.length > 0) {
      quarentena.push({ registro: linha, motivos });
      processados.set(linha.nsr, hash);
      continue;
    }
    inserir.push(linha);
    if (preenche) lacunasPreenchidas.push(linha);
    processados.set(linha.nsr, hash);
    avancar(linha);
    if (confiavel(linha) && (novoUltimoNsr === null || linha.nsr > novoUltimoNsr)) novoUltimoNsr = linha.nsr;
  }

  let retrocesso: Retrocesso | undefined;
  let lacunasTruncadasEm: number | undefined;
  if (linhas.length > 0) {
    // limite superior da análise: maior NSR confiável (aceito, duplicado ou em conflito); quarentena não abre lacuna falsa
    let maiorConfiavel = Number.NEGATIVE_INFINITY;
    for (const x of inserir) if (x.nsr > maiorConfiavel) maiorConfiavel = x.nsr;
    for (const x of duplicadas) if (x.nsr > maiorConfiavel) maiorConfiavel = x.nsr;
    for (const c of conflitos) if (c.registro.nsr > maiorConfiavel) maiorConfiavel = c.registro.nsr;
    let aberta: number | null = null;
    const comeco = ultimoNsr !== null ? ultimoNsr + 1 : menor;
    let fim = maiorConfiavel;
    if (fim - comeco > LIMITE_ANALISE_LACUNAS) {
      fim = comeco + LIMITE_ANALISE_LACUNAS;
      lacunasTruncadasEm = fim + 1;
    }
    for (let n = comeco; n <= fim; n++) {
      const existe = hashesNoArquivo.has(n) || lerHash(estado.hashesPorNsr, n) !== undefined;
      if (!existe && aberta === null) aberta = n;
      if (existe && aberta !== null) {
        lacunas.push({ de: aberta, ate: n - 1 });
        aberta = null;
      }
    }
    if (aberta !== null) lacunas.push({ de: aberta, ate: fim });

    if (ultimoNsr !== null && menor <= ultimoNsr && duplicadasDoEstado === 0) {
      // conflitos seguidos a partir do menor NSR do arquivo (em ordem de NSR)
      const emConflito = new Set(conflitos.map(c => c.registro.nsr));
      let seguidos = 0;
      for (let n = menor; n <= maior && emConflito.has(n); n++) seguidos++;
      if (seguidos >= 2 || (seguidos >= 1 && maior <= ultimoNsr)) {
        retrocesso = { ultimoNsr, primeiroNsrArquivo: menor, maiorNsrArquivo: maior };
      }
    }
  }

  const bloqueada = retrocesso !== undefined;
  return {
    inserir: bloqueada ? [] : inserir,
    duplicadas,
    conflitos,
    quarentena,
    lacunasPreenchidas: bloqueada ? [] : lacunasPreenchidas,
    lacunas,
    ...(lacunasTruncadasEm !== undefined ? { lacunasTruncadasEm } : {}),
    ...(retrocesso ? { retrocesso } : {}),
    bloqueada,
    retidasPorBloqueio: bloqueada ? inserir : [],
    novoUltimoNsr: bloqueada ? ultimoNsr : novoUltimoNsr,
  };
}

/**
 * P8-R2-01: o NSR que preenche a lacuna [de, ate] precisa ficar, no tempo, entre os vizinhos gravados `de - 1` e
 * `ate + 1` (com a tolerância) e não pode voltar no tempo em relação ao preenchimento anterior da mesma lacuna.
 */
function coerenciaDoPreenchimento(estado: EstadoConhecido, lacuna: Lacuna, linha: LinhaParaDecisao, tolerancia: number, anteriorNoArquivo: number | undefined): CodigoInconsistencia | null {
  const nsrAntes = lacuna.de - 1;
  const nsrDepois = lacuna.ate + 1;
  const tAntes = lerMapa(estado.instantesPorNsr, nsrAntes);
  const tDepois = lerMapa(estado.instantesPorNsr, nsrDepois);
  if (lerHash(estado.hashesPorNsr, nsrAntes) === undefined || lerHash(estado.hashesPorNsr, nsrDepois) === undefined || typeof tAntes !== "number" || typeof tDepois !== "number") {
    return "ESTADO_INCOMPLETO";
  }
  const t = linha.instante;
  if (typeof t !== "number" || !Number.isFinite(t)) return "LACUNA_INCOERENTE";
  if (t < tAntes - tolerancia || t > tDepois + tolerancia) return "LACUNA_INCOERENTE";
  if (anteriorNoArquivo !== undefined && t < anteriorNoArquivo - tolerancia) return "LACUNA_INCOERENTE";
  return null;
}

/**
 * Atalho recomendado para a F2: decide a importação a partir do resultado do parser. Se o arquivo foi rejeitado
 * (leiaute, encoding, empregador fora da empresa...), tudo vai para quarentena e nada é inserido.
 */
export function planejarImportacao(estado: EstadoConhecido, parse: ResultadoParser, opcoes: Omit<OpcoesDecisao, "rejeitarArquivo"> = {}): DecisaoImportacao<ResultadoParser["registros"][number]> {
  return decidirImportacao(estado, parse.registros, parse.motivosRejeicao.length > 0 ? { ...opcoes, rejeitarArquivo: parse.motivosRejeicao[0] } : opcoes);
}
