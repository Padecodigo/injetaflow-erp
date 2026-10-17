import type { DataRepository } from "./repository";
import type { SessionUser } from "./types";
import { actorOf, audit } from "./audit";
import { flatten, findByMatricula } from "./records";
import { avaliarSequencia, eventsOf, type TipoPonto } from "./rh";
import { localDateOf, normalizeText, todayIso } from "./text";
import { ORIGEM_DEMONSTRACAO } from "@shared/erp/ponto";

/**
 * P7-05/P7-07 (aceite do PR #7): ÚNICO gravador de marcação de ponto no código, e só para DEMONSTRAÇÃO e testes.
 *
 * - Não é rota: nenhum arquivo do router importa este módulo (há teste de regressão que garante isso).
 * - Exige `demo: true` e grava sempre origem "Demonstração", marcada como demo e simulada. O ERP não grava
 *   origem "GPS"/"Rede local"/"Manual" (F0c: a origem oficial das marcações é o relógio, o REP).
 * - Fora de sequência nunca é recusado (F0a; Portaria 671, arts. 74 e 98): grava com `validacao: "DIVERGENTE"`.
 */
export async function registrarPontoDemonstracao(
  repo: DataRepository,
  user: SessionUser,
  input: { matricula: string; tipo: TipoPonto; demo: true; observacao?: string; now?: Date }
) {
  if (input?.demo !== true) throw new Error("registrarPontoDemonstracao só grava dados de demonstração (demo: true). O ERP não registra ponto: a marcação oficial é feita no relógio (REP).");
  const matricula = input.matricula.trim().toUpperCase();
  const pessoa = await findByMatricula(repo, user.empresaId, matricula);
  if (!pessoa) throw new Error(`Matrícula "${matricula}" não encontrada ou inativa.`);
  const now = input.now ?? new Date();
  const day = todayIso(now);
  const doDia = await eventsOf(repo, user.empresaId, data => normalizeText(data.matricula) === normalizeText(matricula) && localDateOf(String(data.dataHora)) === day && String(data.dataHora) <= now.toISOString());
  const last = (doDia.at(-1)?.data.tipo as TipoPonto | undefined) ?? null;
  const sequencia = avaliarSequencia(last, input.tipo);
  const record = await repo.insert("ponto", user.empresaId, {
    matricula,
    nome: pessoa.nome,
    tipo: input.tipo,
    origem: ORIGEM_DEMONSTRACAO,
    simulado: "sim",
    dataHora: now.toISOString(),
    observacao: input.observacao?.trim() || "Marcação fictícia de demonstração (não veio do relógio oficial)",
    registradoPor: user.nome,
    foraDeSequencia: sequencia.foraDeSequencia,
    validacao: sequencia.foraDeSequencia ? "DIVERGENTE" : "OK",
    ...(sequencia.divergencia ? { divergencia: sequencia.divergencia } : {}),
  }, { actor: actorOf(user), demo: true });
  await audit(repo, user.empresaId, user, { acao: "ponto", modulo: "rh", registroId: record.id, resumo: `[Demonstração] ${input.tipo} de ${pessoa.nome} (${matricula})${sequencia.foraDeSequencia ? " · DIVERGENTE (fora de sequência)" : ""}` });
  return flatten(record);
}
