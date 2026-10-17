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

export async function audit(repo: DataRepository, empresaId: string, user: SessionUser | null, entry: Omit<AuditEntry, "usuarioId" | "usuario" | "matricula"> & { matricula?: string | null }) {
  await repo.insert<AuditEntry>("auditoria", empresaId, {
    ...entry,
    usuarioId: user?.id,
    usuario: user?.nome ?? "Portal público",
    matricula: entry.matricula ?? user?.matricula ?? null,
  }, { actor: user ? actorOf(user) : null });
}

export function actorOf(user: SessionUser) {
  return { id: user.id, nome: user.nome, matricula: user.matricula ?? null };
}
