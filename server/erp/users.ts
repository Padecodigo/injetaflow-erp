import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { PERFIS, SETORES, isAdminPerfil, type Permissions } from "@shared/erp/modules";
import type { DataRepository, StoredRecord } from "./repository";
import type { SessionUser, UserData } from "./types";
import { actorOf, audit } from "./audit";
import { USERS, destroyUserSessions, findUserByEmail, hashUserPassword, normalizeEmail, sanitizePermissions, toSessionUser } from "./auth";
import { normalizeText } from "./text";

const permissionsSchema = z.record(z.string(), z.enum(["ver", "editar"])).transform(value => sanitizePermissions(value));

export const userCreateSchema = z.object({
  nome: z.string().trim().min(3, "Nome: informe o nome completo").max(120),
  email: z.string().trim().toLowerCase().email("E-mail inválido").max(200),
  senha: z.string().min(8, "Senha: mínimo de 8 caracteres").max(200),
  setor: z.enum(SETORES, { message: "Setor inválido" }),
  perfil: z.enum(PERFIS, { message: "Perfil inválido" }),
  matricula: z.string().trim().min(1, "Matrícula obrigatória").max(40).transform(value => value.toUpperCase()),
  permissoes: permissionsSchema.default({}),
  status: z.enum(["Ativo", "Inativo"]).default("Ativo"),
});

export const userUpdateSchema = userCreateSchema.omit({ senha: true }).partial().extend({
  novaSenha: z.string().min(8, "Nova senha: mínimo de 8 caracteres").max(200).optional().or(z.literal("").transform(() => undefined)),
});

export type UserListQuery = { search?: string; perfil?: string; status?: string; setor?: string; page?: number; pageSize?: number };

export async function listUsers(repo: DataRepository, empresaId: string, query: UserListQuery = {}) {
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 10));
  const needle = normalizeText(query.search);
  const { items, total } = await repo.list<UserData>(USERS, empresaId, {
    filter: data =>
      (!needle || normalizeText(`${data.nome} ${data.email} ${data.matricula} ${data.setor}`).includes(needle)) &&
      (!query.perfil || data.perfil === query.perfil) &&
      (!query.status || data.status === query.status) &&
      (!query.setor || data.setor === query.setor),
    sort: (a, b) => a.data.nome.localeCompare(b.data.nome, "pt-BR"),
    offset: (page - 1) * pageSize,
    limit: pageSize,
  });
  return { items: items.map(item => ({ ...toSessionUser(item), createdAt: item.createdAt, demo: item.demo ?? false })), total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

async function assertMatriculaFree(repo: DataRepository, empresaId: string, matricula: string, ignoreId?: string) {
  const { total } = await repo.list<UserData>(USERS, empresaId, { filter: (data, record) => record.id !== ignoreId && normalizeText(data.matricula) === normalizeText(matricula), limit: 1 });
  if (total > 0) throw new TRPCError({ code: "CONFLICT", message: `Matrícula "${matricula}" já pertence a outro usuário.` });
}

async function countActiveAdmins(repo: DataRepository, empresaId: string, ignoreId?: string) {
  const { total } = await repo.list<UserData>(USERS, empresaId, { filter: (data, record) => record.id !== ignoreId && data.status === "Ativo" && isAdminPerfil(data.perfil) });
  return total;
}

export async function createUser(repo: DataRepository, actor: SessionUser | null, empresaId: string, input: z.input<typeof userCreateSchema>, opts: { demo?: boolean } = {}) {
  const parsed = userCreateSchema.safeParse(input);
  if (!parsed.success) throw new TRPCError({ code: "BAD_REQUEST", message: parsed.error.issues.map(issue => issue.message).join("; ") });
  const data = parsed.data;
  if (await findUserByEmail(repo, data.email)) throw new TRPCError({ code: "CONFLICT", message: `O e-mail ${data.email} já está cadastrado.` });
  await assertMatriculaFree(repo, empresaId, data.matricula);
  const record = await repo.insert<UserData>(USERS, empresaId, {
    nome: data.nome,
    email: normalizeEmail(data.email),
    senhaHash: hashUserPassword(data.senha),
    setor: data.setor,
    perfil: data.perfil,
    matricula: data.matricula,
    permissoes: data.permissoes as Permissions,
    status: data.status,
    ultimoAcesso: null,
  }, { actor: actor ? actorOf(actor) : null, demo: opts.demo });
  await audit(repo, empresaId, actor, { acao: "criar", modulo: "usuarios", registroId: record.id, resumo: `Usuário ${data.nome} (${data.perfil})` });
  return toSessionUser(record);
}

export async function updateUser(repo: DataRepository, actor: SessionUser, id: string, input: z.input<typeof userUpdateSchema>) {
  const parsed = userUpdateSchema.safeParse(input);
  if (!parsed.success) throw new TRPCError({ code: "BAD_REQUEST", message: parsed.error.issues.map(issue => issue.message).join("; ") });
  const existing = await repo.get<UserData>(USERS, actor.empresaId, id);
  if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Usuário não encontrado." });
  const { novaSenha, ...rest } = parsed.data;
  const patch: Partial<UserData> = { ...rest } as Partial<UserData>;
  if (rest.email && normalizeEmail(rest.email) !== existing.data.email) {
    const other = await findUserByEmail(repo, rest.email);
    if (other && other.id !== id) throw new TRPCError({ code: "CONFLICT", message: `O e-mail ${rest.email} já está cadastrado.` });
    patch.email = normalizeEmail(rest.email);
  }
  if (rest.matricula) await assertMatriculaFree(repo, actor.empresaId, rest.matricula, id);
  const willBeAdmin = isAdminPerfil(rest.perfil ?? existing.data.perfil) && (rest.status ?? existing.data.status) === "Ativo";
  if (isAdminPerfil(existing.data.perfil) && !willBeAdmin && (await countActiveAdmins(repo, actor.empresaId, id)) === 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "A empresa precisa de pelo menos um administrador ativo." });
  }
  if (id === actor.id && (rest.status === "Inativo" || (rest.perfil && !isAdminPerfil(rest.perfil) && isAdminPerfil(existing.data.perfil)))) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Você não pode desativar nem rebaixar o seu próprio acesso." });
  }
  if (novaSenha) patch.senhaHash = hashUserPassword(novaSenha);
  const updated = (await repo.update<UserData>(USERS, actor.empresaId, id, patch, actorOf(actor))) as StoredRecord<UserData>;
  if (patch.status === "Inativo" || novaSenha) await destroyUserSessions(repo, id);
  await audit(repo, actor.empresaId, actor, { acao: "editar", modulo: "usuarios", registroId: id, resumo: `Usuário ${updated.data.nome}${novaSenha ? " (senha redefinida)" : ""}` });
  return toSessionUser(updated);
}

export async function deleteUser(repo: DataRepository, actor: SessionUser, id: string) {
  if (id === actor.id) throw new TRPCError({ code: "BAD_REQUEST", message: "Você não pode excluir o seu próprio usuário." });
  const existing = await repo.get<UserData>(USERS, actor.empresaId, id);
  if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Usuário não encontrado." });
  if (isAdminPerfil(existing.data.perfil) && existing.data.status === "Ativo" && (await countActiveAdmins(repo, actor.empresaId, id)) === 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "A empresa precisa de pelo menos um administrador ativo." });
  }
  await repo.softDelete(USERS, actor.empresaId, id, actorOf(actor));
  await destroyUserSessions(repo, id);
  await audit(repo, actor.empresaId, actor, { acao: "excluir", modulo: "usuarios", registroId: id, resumo: `Usuário ${existing.data.nome}` });
  return { success: true as const };
}
