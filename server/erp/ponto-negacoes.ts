import type { DataRepository } from "./repository";
import type { SessionUser } from "./types";
import { audit, type AuditEntry } from "./audit";
import { normalizeText } from "./text";

/**
 * P7-01/P7-03/P7-08 (aceite R1) e P7-R2-02 (aceite R2): trilha das tentativas de criar, alterar ou excluir
 * marcação de ponto pelo ERP (F0c: o ponto é registrado só no relógio oficial, o REP).
 *
 * A auditoria é APPEND-ONLY: nenhuma entrada existente é editada. Limite contra inflação do log:
 * - a 1ª negação de uma janela de `JANELA_NEGACAO_MS` (por empresa + usuário + rota) grava UMA entrada, com o
 *   resumo daquela tentativa (próprio ponto × outra pessoa) e a matrícula-alvo dela;
 * - as tentativas seguintes da mesma janela não são gravadas: só são contadas em memória;
 * - a 1ª negação da janela seguinte grava uma entrada nova que informa quantas tentativas foram suprimidas
 *   na janela anterior (`suprimidasJanelaAnterior`).
 * Limitação conhecida: o contador vive na memória do processo. Um reinício perde as suprimidas ainda não
 * reportadas, e tentativas suprimidas só aparecem quando houver uma nova negação depois da janela.
 */
export const JANELA_NEGACAO_MS = 10 * 60 * 1000;
const MAX_TEXTO = 40;
const MAX_CHAVES = 10_000;

export type RotaNegadaPonto = "records.create" | "records.update" | "records.remove";

export type NegacaoPontoEntry = AuditEntry & {
  rota: RotaNegadaPonto;
  /** Matrícula-alvo desta tentativa ("" quando não informada). */
  alvo: string;
  tipo?: string;
  janelaInicio: string;
  janelaFim: string;
  /** Tentativas da mesma empresa + usuário + rota descartadas na janela anterior. */
  suprimidasJanelaAnterior: number;
};

/** Texto vindo do cliente: string curta, sem quebras, truncada. Qualquer outro tipo vira vazio. */
export function textoSeguro(value: unknown, max = MAX_TEXTO): string {
  if (typeof value !== "string" && typeof value !== "number") return "";
  // troca caracteres de controle (quebras de linha, tabs, NUL...) por espaço, sem regex de controle
  const limpo = Array.from(String(value), ch => (ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127 ? " " : ch)).join("");
  return limpo.replace(/ +/g, " ").trim().slice(0, max);
}

const ACAO_POR_ROTA: Record<RotaNegadaPonto, string> = {
  "records.create": "registrar",
  "records.update": "alterar",
  "records.remove": "excluir",
};

/** Resumo legível da tentativa (P7-03): próprio ponto × outra pessoa, com a matrícula-alvo e o tipo. */
export function resumoNegacaoPonto(user: Pick<SessionUser, "matricula">, rota: RotaNegadaPonto, alvo: string, tipo?: string): string {
  const verbo = ACAO_POR_ROTA[rota];
  const oque = rota === "records.create" ? "ponto" : "marcação de ponto";
  const tipoTxt = tipo ? ` (${tipo})` : "";
  let quem: string;
  if (!alvo) quem = "sem matrícula informada";
  else if (user.matricula && normalizeText(alvo) === normalizeText(user.matricula)) quem = `o próprio ponto, matrícula ${alvo}`;
  else quem = `em nome de outra pessoa, matrícula ${alvo}`;
  return `Tentativa de ${verbo} ${oque}${tipoTxt} pelo ERP (${quem}) via ${rota}: bloqueada, o ponto só é registrado no relógio oficial (REP)`;
}

type Janela = { inicio: number; fim: number; suprimidas: number };
const janelas = new Map<string, Janela>();

/** Só para testes: zera os contadores em memória. */
export function resetNegacoesPonto() {
  janelas.clear();
}

export type ResultadoNegacao = { gravada: boolean; suprimidasJanelaAnterior: number; suprimidasNaJanela: number };

export async function auditarNegacaoPonto(
  repo: DataRepository,
  user: SessionUser,
  input: { rota: RotaNegadaPonto; alvo?: unknown; tipo?: unknown; registroId?: string },
  now: Date = new Date()
): Promise<ResultadoNegacao> {
  const chave = `${user.empresaId}|${user.id}|${input.rota}`;
  const t = now.getTime();
  const atual = janelas.get(chave);
  // decisão síncrona (antes de qualquer await): chamadas paralelas não gravam duas vezes na mesma janela
  if (atual && t < atual.fim) {
    atual.suprimidas++;
    return { gravada: false, suprimidasJanelaAnterior: 0, suprimidasNaJanela: atual.suprimidas };
  }
  const suprimidasJanelaAnterior = atual?.suprimidas ?? 0;
  if (!atual && janelas.size >= MAX_CHAVES) {
    for (const [k, j] of janelas) if (j.fim <= t && j.suprimidas === 0) janelas.delete(k);
  }
  const janela: Janela = { inicio: t, fim: t + JANELA_NEGACAO_MS, suprimidas: 0 };
  janelas.set(chave, janela);

  const alvo = textoSeguro(input.alvo).toUpperCase();
  const tipo = textoSeguro(input.tipo) || undefined;
  const sufixo = suprimidasJanelaAnterior > 0 ? ` · ${suprimidasJanelaAnterior} tentativa(s) desta rota suprimida(s) na janela anterior de 10 min` : "";
  await audit(repo, user.empresaId, user, {
    acao: "negado",
    modulo: "rh",
    registroId: input.registroId,
    resumo: resumoNegacaoPonto(user, input.rota, alvo, tipo) + sufixo,
    rota: input.rota,
    alvo,
    ...(tipo ? { tipo } : {}),
    janelaInicio: new Date(janela.inicio).toISOString(),
    janelaFim: new Date(janela.fim).toISOString(),
    suprimidasJanelaAnterior,
  } as Omit<NegacaoPontoEntry, "usuarioId" | "usuario" | "matricula">);
  return { gravada: true, suprimidasJanelaAnterior, suprimidasNaJanela: 0 };
}
