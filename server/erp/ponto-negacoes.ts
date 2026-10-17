import type { DataRepository } from "./repository";
import type { SessionUser } from "./types";
import { audit, actorOf, type AuditEntry } from "./audit";
import { normalizeText } from "./text";

/**
 * P7-01/P7-02/P7-03/P7-08 (aceite dos PRs #7/#8): trilha das tentativas de criar, alterar ou excluir
 * marcação de ponto pelo ERP (F0c: o ponto é registrado só no relógio oficial, o REP).
 *
 * - Toda negação no módulo ponto é auditada (`acao: "negado"`), inclusive para quem nem tem `rh:editar`.
 * - Anti-inflação: no máximo UMA entrada por usuário + rota a cada `JANELA_NEGACAO_MS`. As tentativas
 *   seguintes na mesma janela só incrementam `tentativas` (e guardam até `MAX_ALVOS` matrículas-alvo
 *   distintas) na própria entrada. Um script em laço gera 1 linha a cada 10 min, não milhares.
 * - O resumo diz se a tentativa era sobre o PRÓPRIO ponto ou "em nome de outra pessoa", com a matrícula-alvo.
 */
export const JANELA_NEGACAO_MS = 10 * 60 * 1000;
export const MAX_ALVOS = 10;
const MAX_TEXTO = 40;

export type RotaNegadaPonto = "records.create" | "records.update" | "records.remove";

export type NegacaoPontoEntry = AuditEntry & {
  rota: RotaNegadaPonto;
  /** resumo da 1ª tentativa da janela; `resumo` acrescenta o contador e as matrículas-alvo para a tela de auditoria */
  resumoBase: string;
  tentativas: number;
  alvos: string[];
  janelaInicio: string;
  janelaFim: string;
  ultimaTentativa: string;
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

// serializa por usuário+rota, para que chamadas paralelas não criem várias entradas na mesma janela
const filas = new Map<string, Promise<unknown>>();

export async function auditarNegacaoPonto(
  repo: DataRepository,
  user: SessionUser,
  input: { rota: RotaNegadaPonto; alvo?: unknown; tipo?: unknown; registroId?: string },
  now: Date = new Date()
): Promise<{ entradaId: string; tentativas: number; nova: boolean }> {
  const chave = `${user.empresaId}|${user.id}|${input.rota}`;
  const anterior = filas.get(chave) ?? Promise.resolve();
  const atual = anterior.catch(() => undefined).then(() => registrar(repo, user, input, now));
  filas.set(chave, atual);
  try {
    return await atual;
  } finally {
    if (filas.get(chave) === atual) filas.delete(chave);
  }
}

async function registrar(repo: DataRepository, user: SessionUser, input: { rota: RotaNegadaPonto; alvo?: unknown; tipo?: unknown; registroId?: string }, now: Date) {
  const alvo = textoSeguro(input.alvo).toUpperCase();
  const tipo = textoSeguro(input.tipo) || undefined;
  const nowIso = now.toISOString();
  const { items } = await repo.list<NegacaoPontoEntry>("auditoria", user.empresaId, {
    filter: data => data.acao === "negado" && data.usuarioId === user.id && data.rota === input.rota && typeof data.janelaFim === "string" && data.janelaFim > nowIso,
    limit: 1,
  });
  const aberta = items[0];
  if (aberta) {
    const tentativas = (Number(aberta.data.tentativas) || 1) + 1;
    const alvos = Array.isArray(aberta.data.alvos) ? [...aberta.data.alvos] : [];
    if (alvo && !alvos.includes(alvo) && alvos.length < MAX_ALVOS) alvos.push(alvo);
    const resumoBase = String(aberta.data.resumoBase ?? aberta.data.resumo);
    const resumo = `${resumoBase} · ${tentativas} tentativas nesta janela de 10 min${alvos.length > 1 ? ` · matrículas-alvo: ${alvos.join(", ")}` : ""}`;
    await repo.update<Partial<NegacaoPontoEntry>>("auditoria", user.empresaId, aberta.id, { tentativas, alvos, resumo, ultimaTentativa: nowIso }, actorOf(user));
    return { entradaId: aberta.id, tentativas, nova: false };
  }
  const janelaFim = new Date(now.getTime() + JANELA_NEGACAO_MS).toISOString();
  await audit(repo, user.empresaId, user, {
    acao: "negado",
    modulo: "rh",
    registroId: input.registroId,
    resumo: resumoNegacaoPonto(user, input.rota, alvo, tipo),
    resumoBase: resumoNegacaoPonto(user, input.rota, alvo, tipo),
    rota: input.rota,
    tentativas: 1,
    alvos: alvo ? [alvo] : [],
    janelaInicio: nowIso,
    janelaFim,
    ultimaTentativa: nowIso,
  } as Omit<NegacaoPontoEntry, "usuarioId" | "usuario" | "matricula">);
  const { items: criadas } = await repo.list<NegacaoPontoEntry>("auditoria", user.empresaId, {
    filter: data => data.acao === "negado" && data.usuarioId === user.id && data.rota === input.rota && data.janelaFim === janelaFim,
    limit: 1,
  });
  return { entradaId: criadas[0]?.id ?? "", tentativas: 1, nova: true };
}
