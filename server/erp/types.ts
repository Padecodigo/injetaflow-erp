import type { Permissions } from "@shared/erp/modules";

export type UserStatus = "Ativo" | "Inativo";

export type UserData = {
  nome: string;
  email: string;
  senhaHash: string;
  setor: string;
  perfil: string;
  matricula: string;
  permissoes: Permissions;
  status: UserStatus;
  ultimoAcesso?: string | null;
};

/** Usuário exposto ao cliente: nunca contém o hash de senha. */
export type SessionUser = {
  id: string;
  empresaId: string;
  nome: string;
  email: string;
  setor: string;
  perfil: string;
  matricula: string;
  permissoes: Permissions;
  status: UserStatus;
  ultimoAcesso?: string | null;
};

export type SessionData = { tokenHash: string; userId: string; expiresAt: string; ip?: string };
