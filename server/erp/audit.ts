import type { DataRepository } from "./repository";
import type { SessionUser } from "./types";

export type AuditEntry = {
  acao: string;
  modulo: string;
  registroId?: string;
  resumo: string;
  usuarioId?: string;
  usuario?: string;
  matricula?: string | null;
};

/** Autores técnicos (ações sem sessão de usuário). */
export const AUTOR_MIGRACAO = "Sistema (migração)";
export const AUTOR_INICIALIZACAO = "Sistema (inicialização)";
export const AUTOR_CLI = "Linha de comando";
export const AUTOR_PORTAL = "Portal público";

/** Ator técnico para os metadados do registro (createdBy/updatedBy/deletedBy). */
export function systemActor(autor: string) {
  const id = autor === AUTOR_CLI ? "cli" : autor === AUTOR_PORTAL ? "portal" : "sistema";
  return { id, nome: autor, matricula: null };
}

/**
 * Grava uma linha de auditoria. Sem usuário logado, o autor é `entry.autor`
 * (ex.: "Sistema (migração)", "Linha de comando"); o padrão continua "Portal público".
 */
export async function audit(repo: DataRepository, empresaId: string, user: SessionUser | null, entry: Omit<AuditEntry, "usuarioId" | "usuario" | "matricula"> & { matricula?: string | null; autor?: string }) {
  const { autor, ...rest } = entry;
  const nome = user?.nome ?? autor ?? AUTOR_PORTAL;
  await repo.insert<AuditEntry>("auditoria", empresaId, {
    ...rest,
    usuarioId: user?.id,
    usuario: nome,
    matricula: rest.matricula ?? user?.matricula ?? null,
  }, { actor: user ? actorOf(user) : autor ? systemActor(autor) : null });
}

export function actorOf(user: SessionUser) {
  return { id: user.id, nome: user.nome, matricula: user.matricula ?? null };
}
