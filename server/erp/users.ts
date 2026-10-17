import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { PERFIS, SETORES, isAdminPerfil, type Permissions } from "@shared/erp/modules";
import type { DataRepository, StoredRecord } from "./repository";
import type { SessionUser, UserData } from "./types";
import { actorOf, audit } from "./audit";
import { USERS, destroyUserSessions, findUserByEmail, hashUserPassword, normalizeEmail, sanitizePermissions, toSessionUser } from "./auth";
import { normalizeText } from "./text";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, PASSWORD_MIN_MESSAGE, USERNAME_MAX_LENGTH, normalizeUsername, usernameError, usernameFromEmail } from "@shared/erp/account";

const permissionsSchema = z.record(z.string(), z.enum(["ver", "editar"])).transform(value => sanitizePermissions(value));

const usernameSchema = z.string().trim().toLowerCase().superRefine((value, ctx) => {
  const error = usernameError(value);
  if (error) ctx.addIssue({ code: "custom", message: error });
});

export const userCreateSchema = z.object({
  nome: z.string().trim().min(3, "Nome: informe o nome completo").max(120),
  email: z.string().trim().toLowerCase().email("E-mail inválido").max(200),
  /** Opcional na criação: se vazio, é derivado do e-mail. */
  username: usernameSchema.optional().or(z.literal("").transform(() => undefined)),
  senha: z.string().min(PASSWORD_MIN_LENGTH, `Senha: ${PASSWORD_MIN_MESSAGE}`).max(PASSWORD_MAX_LENGTH),
  setor: z.enum(SETORES, { message: "Setor inválido" }),
  perfil: z.enum(PERFIS, { message: "Perfil inválido" }),
  matricula: z.string().trim().min(1, "Matrícula obrigatória").max(40).transform(value => value.toUpperCase()),
  permissoes: permissionsSchema.default({}),
  status: z.enum(["Ativo", "Inativo"]).default("Ativo"),
});

export const userUpdateSchema = userCreateSchema.omit({ senha: true }).partial().extend({
  username: usernameSchema.optional(),
  novaSenha: z.string().min(PASSWORD_MIN_LENGTH, `Nova senha: ${PASSWORD_MIN_MESSAGE}`).max(PASSWORD_MAX_LENGTH).optional().or(z.literal("").transform(() => undefined)),
});

/** Meu perfil: o próprio usuário só pode mudar o nome de usuário (senha vai por auth.changePassword). */
export const ownAccountSchema = z.object({ username: usernameSchema }).strict();
export const OWN_ACCOUNT_FORBIDDEN = "Em Meu perfil só é possível alterar o nome de usuário e a senha. Matrícula, perfil, setor e permissões são definidos pelo administrador.";

export type UserListQuery = { search?: string; perfil?: string; status?: string; setor?: string; page?: number; pageSize?: number };

export async function listUsers(repo: DataRepository, empresaId: string, query: UserListQuery = {}) {
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 10));
  const needle = normalizeText(query.search);
  const { items, total } = await repo.list<UserData>(USERS, empresaId, {
    filter: data =>
      (!needle || normalizeText(`${data.nome} ${data.email} ${data.username ?? ""} ${data.matricula} ${data.setor}`).includes(needle)) &&
      (!query.perfil || data.perfil === query.perfil) &&
      (!query.status || data.status === query.status) &&
      (!query.setor || data.setor === query.setor),
    sort: (a, b) => a.data.nome.localeCompare(b.data.nome, "pt-BR"),
    offset: (page - 1) * pageSize,
    limit: pageSize,
  });
  return { items: items.map(item => ({ ...toSessionUser(item), createdAt: item.createdAt, demo: item.demo ?? false })), total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

const lower = (value: unknown) => String(value ?? "").trim().toLowerCase();

/** Matrícula única por empresa e sem colidir com o nome de usuário de outra pessoa (o login aceita os dois). */
async function assertMatriculaFree(repo: DataRepository, empresaId: string, matricula: string, ignoreId?: string) {
  const { items } = await repo.list<UserData>(USERS, empresaId, { filter: (data, record) => record.id !== ignoreId && (normalizeText(data.matricula) === normalizeText(matricula) || lower(data.username) === lower(matricula)), limit: 1 });
  if (items[0]) throw new TRPCError({ code: "CONFLICT", message: normalizeText(items[0].data.matricula) === normalizeText(matricula) ? `Matrícula "${matricula}" já pertence a outro usuário.` : `Matrícula "${matricula}" é o nome de usuário de outra pessoa. Escolha outra.` });
}

/** Nome de usuário único por empresa (sem diferenciar maiúsculas) e sem colidir com matrícula de outra pessoa. */
export async function assertUsernameFree(repo: DataRepository, empresaId: string, username: string, ignoreId?: string) {
  const wanted = normalizeUsername(username);
  const { items } = await repo.list<UserData>(USERS, empresaId, { includeDeleted: false, filter: (data, record) => record.id !== ignoreId && (lower(data.username) === wanted || lower(data.matricula) === wanted), limit: 1 });
  if (items[0]) throw new TRPCError({ code: "CONFLICT", message: lower(items[0].data.username) === wanted ? `O nome de usuário "${wanted}" já está em uso.` : `"${wanted}" é a matrícula de outra pessoa. Escolha outro nome de usuário.` });
}

/** Próximo nome de usuário livre a partir de uma base (base, base2, base3...). */
export async function uniqueUsername(repo: DataRepository, empresaId: string, base: string, ignoreId?: string): Promise<string> {
  const root = normalizeUsername(base).slice(0, USERNAME_MAX_LENGTH - 3) || "usuario";
  const { items } = await repo.list<UserData>(USERS, empresaId, { filter: (_data, record) => record.id !== ignoreId });
  const taken = new Set(items.flatMap(item => [lower(item.data.username), lower(item.data.matricula)]));
  if (!taken.has(root) && !usernameError(root)) return root;
  for (let n = 2; n < 10000; n++) {
    const candidate = `${root}${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  throw new Error("Não foi possível gerar um nome de usuário livre.");
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
  let username: string;
  if (data.username) {
    await assertUsernameFree(repo, empresaId, data.username);
    username = normalizeUsername(data.username);
  } else {
    username = await uniqueUsername(repo, empresaId, usernameFromEmail(data.email));
  }
  const record = await repo.insert<UserData>(USERS, empresaId, {
    nome: data.nome,
    email: normalizeEmail(data.email),
    username,
    senhaHash: hashUserPassword(data.senha),
    setor: data.setor,
    perfil: data.perfil,
    matricula: data.matricula,
    permissoes: data.permissoes as Permissions,
    status: data.status,
    ultimoAcesso: null,
  }, { actor: actor ? actorOf(actor) : null, demo: opts.demo });
  await audit(repo, empresaId, actor, { acao: "criar", modulo: "usuarios", registroId: record.id, resumo: `Usuário ${data.nome} (${data.perfil}) · usuário "${username}" · matrícula ${data.matricula}` });
  return toSessionUser(record);
}

const CAMPOS: Record<string, string> = { nome: "nome", email: "e-mail", username: "nome de usuário", matricula: "matrícula", setor: "setor", perfil: "perfil", permissoes: "módulos", status: "status" };

/**
 * Edição em Usuários. Administrador pode alterar qualquer campo de qualquer usuário
 * (inclusive matrícula, nome de usuário, e-mail, perfil, setor, módulos, status e senha).
 * Outros perfis com "Usuários: editar" não alteram matrícula de ninguém, não concedem
 * perfil Administrador e não editam administradores. Tudo vai para a auditoria.
 */
export async function updateUser(repo: DataRepository, actor: SessionUser, id: string, input: z.input<typeof userUpdateSchema>) {
  const parsed = userUpdateSchema.safeParse(input);
  if (!parsed.success) throw new TRPCError({ code: "BAD_REQUEST", message: parsed.error.issues.map(issue => issue.message).join("; ") });
  const existing = await repo.get<UserData>(USERS, actor.empresaId, id);
  if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Usuário não encontrado." });
  const { novaSenha, ...rest } = parsed.data;
  const actorIsAdmin = isAdminPerfil(actor.perfil);
  if (!actorIsAdmin) {
    if (rest.matricula !== undefined && normalizeText(rest.matricula) !== normalizeText(existing.data.matricula)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Somente o administrador pode alterar a matrícula." });
    }
    if (isAdminPerfil(existing.data.perfil) || (rest.perfil && isAdminPerfil(rest.perfil))) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Somente o administrador pode editar administradores ou conceder o perfil Administrador." });
    }
  }
  const patch: Partial<UserData> = { ...rest } as Partial<UserData>;
  if (rest.email && normalizeEmail(rest.email) !== existing.data.email) {
    const other = await findUserByEmail(repo, rest.email);
    if (other && other.id !== id) throw new TRPCError({ code: "CONFLICT", message: `O e-mail ${rest.email} já está cadastrado.` });
    patch.email = normalizeEmail(rest.email);
  }
  if (rest.matricula) await assertMatriculaFree(repo, actor.empresaId, rest.matricula, id);
  if (rest.username !== undefined) {
    await assertUsernameFree(repo, actor.empresaId, rest.username, id);
    patch.username = normalizeUsername(rest.username);
  }
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
  const mudancas = Object.keys(CAMPOS)
    .filter(key => key in patch && JSON.stringify((patch as Record<string, unknown>)[key]) !== JSON.stringify((existing.data as Record<string, unknown>)[key]))
    .map(key => key === "permissoes" ? CAMPOS[key] : `${CAMPOS[key]}: "${String((existing.data as Record<string, unknown>)[key] ?? "")}" → "${String((patch as Record<string, unknown>)[key] ?? "")}"`);
  if (novaSenha) mudancas.push("senha redefinida");
  await audit(repo, actor.empresaId, actor, { acao: "editar", modulo: "usuarios", registroId: id, resumo: `Usuário ${updated.data.nome}${mudancas.length ? ` — ${mudancas.join("; ")}` : " (sem alterações)"}` });
  return toSessionUser(updated);
}

/** Meu perfil: o próprio usuário altera o nome de usuário (com checagem de unicidade). */
export async function updateOwnAccount(repo: DataRepository, actor: SessionUser, input: unknown) {
  const parsed = ownAccountSchema.safeParse(input);
  if (!parsed.success) {
    const forbidden = parsed.error.issues.some(issue => issue.code === "unrecognized_keys");
    if (forbidden) throw new TRPCError({ code: "FORBIDDEN", message: OWN_ACCOUNT_FORBIDDEN });
    throw new TRPCError({ code: "BAD_REQUEST", message: parsed.error.issues.map(issue => issue.message).join("; ") });
  }
  const existing = await repo.get<UserData>(USERS, actor.empresaId, actor.id);
  if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Usuário não encontrado." });
  const username = normalizeUsername(parsed.data.username);
  if (username === lower(existing.data.username)) return toSessionUser(existing);
  await assertUsernameFree(repo, actor.empresaId, username, actor.id);
  const updated = (await repo.update<UserData>(USERS, actor.empresaId, actor.id, { username }, actorOf(actor))) as StoredRecord<UserData>;
  await audit(repo, actor.empresaId, actor, { acao: "editar", modulo: "usuarios", registroId: actor.id, resumo: `Nome de usuário alterado pelo próprio usuário: "${existing.data.username ?? ""}" → "${username}"` });
  return toSessionUser(updated);
}

/**
 * Migração automática do store (sem perder dados): todo usuário sem nome de usuário recebe um
 * derivado do e-mail; o administrador inicial (o administrador mais antigo de cada empresa)
 * recebe "admin" se estiver livre. Idempotente: roda a cada start e não mexe em quem já tem.
 */
export async function migrateUsernames(repo: DataRepository, opts: { adminUsername?: string } = {}): Promise<{ migrated: number }> {
  const pending = await repo.findAllGlobal<UserData>(USERS, data => !data.username);
  if (pending.length === 0) return { migrated: 0 };
  const adminUsername = normalizeUsername(opts.adminUsername || "admin");
  const empresas = Array.from(new Set(pending.map(user => user.empresaId)));
  let migrated = 0;
  for (const empresaId of empresas) {
    const { items: all } = await repo.list<UserData>(USERS, empresaId, { sort: (a, b) => a.createdAt.localeCompare(b.createdAt) });
    const firstAdmin = all.find(user => isAdminPerfil(user.data.perfil));
    const todo = all.filter(user => !user.data.username);
    // o administrador inicial primeiro, para garantir "admin"
    todo.sort((a, b) => (a.id === firstAdmin?.id ? -1 : b.id === firstAdmin?.id ? 1 : 0));
    for (const user of todo) {
      const base = user.id === firstAdmin?.id ? adminUsername : usernameFromEmail(user.data.email);
      const username = await uniqueUsername(repo, empresaId, base, user.id);
      await repo.update<UserData>(USERS, empresaId, user.id, { username }, { id: "sistema", nome: "Migração automática", matricula: null });
      migrated++;
    }
    await audit(repo, empresaId, null, { acao: "editar", modulo: "usuarios", resumo: `Migração automática: ${todo.length} usuário(s) receberam nome de usuário` });
  }
  return { migrated };
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
