import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { PERFIS, PERMISSION_KEYS, PERMISSION_LABELS, SETORES, accessStrictlyBelow, hasPermission, isAdminPerfil, permissionsBeyond, type Permissions } from "@shared/erp/modules";
import type { DataRepository, StoredRecord } from "./repository";
import type { SessionUser, UserData } from "./types";
import { AUTOR_MIGRACAO, actorOf, audit, systemActor } from "./audit";
import { USERS, conferirSenhaAtual, destroyUserSessions, findUserByEmail, hashUserPassword, normalizeEmail, sanitizePermissions, toSessionUser } from "./auth";
import { normalizeText, semCaracteresDeControle } from "./text";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, PASSWORD_MIN_MESSAGE, USERNAME_MAX_LENGTH, normalizeUsername, usernameError, usernameFromEmail } from "@shared/erp/account";

const permissionsSchema = z.record(z.string(), z.enum(["ver", "editar"])).transform(value => sanitizePermissions(value));

const usernameSchema = z.string({ error: "Informe o nome de usuário." }).trim().toLowerCase().superRefine((value, ctx) => {
  const error = usernameError(value);
  if (error) ctx.addIssue({ code: "custom", message: error });
});

export const userCreateSchema = z.object({
  nome: z.string().trim().min(3, "Nome: informe o nome completo").max(120).refine(semCaracteresDeControle, "Nome: caracteres de controle não são permitidos."),
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

// Sem .default(): numa edição parcial (ex.: só status), campo ausente NÃO pode virar {} / "Ativo".
export const userUpdateSchema = userCreateSchema.omit({ senha: true, permissoes: true, status: true }).partial().extend({
  permissoes: permissionsSchema.optional(),
  status: z.enum(["Ativo", "Inativo"]).optional(),
  username: usernameSchema.optional(),
  novaSenha: z.string().min(PASSWORD_MIN_LENGTH, `Nova senha: ${PASSWORD_MIN_MESSAGE}`).max(PASSWORD_MAX_LENGTH).optional().or(z.literal("").transform(() => undefined)),
  /** B-02: obrigatória quando a pessoa troca a PRÓPRIA senha, e-mail ou nome de usuário por esta rota. */
  senhaAtual: z.string().max(PASSWORD_MAX_LENGTH).optional().or(z.literal("").transform(() => undefined)),
});

/** Meu perfil: o próprio usuário só pode mudar o nome de usuário (senha vai por auth.changePassword). */
export const ownAccountSchema = z.object({ username: usernameSchema }).strict();
export const OWN_ACCOUNT_FORBIDDEN = "Em Meu perfil só é possível alterar o nome de usuário e a senha. Matrícula, perfil, setor e permissões são definidos pelo administrador.";

/** B-08: mesma mensagem para e-mail já usado nesta empresa ou em outra (não revela contas de outras empresas). */
export const EMAIL_INDISPONIVEL = "Este e-mail não pode ser usado. Informe outro e-mail.";
export const SENHA_ATUAL_AUSENTE = "Para alterar a sua própria senha, e-mail ou nome de usuário, informe a sua senha atual.";

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

const LEVEL = { ver: 1, editar: 2 } as const;

function samePermissions(a: unknown, b: unknown) {
  return JSON.stringify(sanitizePermissions(a)) === JSON.stringify(sanitizePermissions(b));
}

/** Descreve a diferença de módulos para a auditoria: "+Financeiro (editar); −RH". */
export function describePermissionChanges(before: unknown, after: unknown) {
  const a = sanitizePermissions(before);
  const b = sanitizePermissions(after);
  const parts: string[] = [];
  for (const key of PERMISSION_KEYS) {
    const label = PERMISSION_LABELS[key];
    if (!a[key] && b[key]) parts.push(`+${label} (${b[key]})`);
    else if (a[key] && !b[key]) parts.push(`−${label}`);
    else if (a[key] !== b[key]) parts.push(`${label}: ${a[key]} → ${b[key]}`);
  }
  return parts.join(", ");
}

/**
 * P6-01: quem não é administrador só concede módulos que ele próprio possui, no mesmo
 * nível ou abaixo ("ver" se ele só vê). Módulos que a pessoa já tinha não contam.
 */
function assertCanGrant(actor: SessionUser, next: Permissions, previous: Permissions = {}) {
  if (isAdminPerfil(actor.perfil)) return;
  const excesso = PERMISSION_KEYS.filter(key => {
    const level = next[key];
    if (!level) return false;
    const before = previous[key];
    if (before && LEVEL[before] >= LEVEL[level]) return false;
    return !hasPermission(actor, key, level);
  });
  if (excesso.length) {
    throw new TRPCError({ code: "FORBIDDEN", message: `Você só pode conceder módulos que você mesmo possui (no mesmo nível). Sem permissão para conceder: ${excesso.map(key => PERMISSION_LABELS[key]).join(", ")}.` });
  }
}

/**
 * R-01 + B-01: quem não é administrador só altera (qualquer campo: módulos, perfil, nome, setor,
 * credenciais, status) ou exclui pessoas com acesso ESTRITAMENTE menor que o dele. Antes só as
 * credenciais eram conferidas, e dava para rebaixar quem tinha mais acesso e depois trocar a senha
 * (tomada de conta). A tentativa negada fica na auditoria.
 */
async function assertStrictlyBelow(repo: DataRepository, actor: SessionUser, target: StoredRecord<UserData>, acao: string) {
  if (isAdminPerfil(actor.perfil) || target.id === actor.id) return;
  const alvo = { perfil: target.data.perfil, permissoes: sanitizePermissions(target.data.permissoes) };
  if (accessStrictlyBelow(actor, alvo)) return;
  const excesso = permissionsBeyond(actor, alvo);
  const motivo = excesso.length ? `tem acesso além do seu (${excesso.map(key => PERMISSION_LABELS[key]).join(", ")})` : "tem acesso igual ao seu";
  await audit(repo, actor.empresaId, actor, { acao: "negado", modulo: "usuarios", registroId: target.id, resumo: `Tentativa negada: ${acao} de ${target.data.nome}, que ${motivo}` });
  throw new TRPCError({ code: "FORBIDDEN", message: `Somente o administrador pode ${acao} de ${target.data.nome}, que ${motivo}.` });
}

const ADMIN_ONLY = "Somente o administrador pode criar, editar ou excluir administradores e conceder o perfil Administrador.";

export async function createUser(repo: DataRepository, actor: SessionUser | null, empresaId: string, input: z.input<typeof userCreateSchema>, opts: { demo?: boolean; autor?: string } = {}) {
  const parsed = userCreateSchema.safeParse(input);
  if (!parsed.success) throw new TRPCError({ code: "BAD_REQUEST", message: parsed.error.issues.map(issue => issue.message).join("; ") });
  const data = parsed.data;
  if (actor && !isAdminPerfil(actor.perfil)) {
    if (isAdminPerfil(data.perfil)) throw new TRPCError({ code: "FORBIDDEN", message: ADMIN_ONLY });
    assertCanGrant(actor, data.permissoes as Permissions);
  }
  if (await findUserByEmail(repo, data.email)) throw new TRPCError({ code: "CONFLICT", message: EMAIL_INDISPONIVEL });
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
  }, { actor: actor ? actorOf(actor) : opts.autor ? systemActor(opts.autor) : null, demo: opts.demo });
  const modulos = isAdminPerfil(data.perfil) ? "todos" : describePermissionChanges({}, data.permissoes) || "nenhum";
  await audit(repo, empresaId, actor, { autor: opts.autor, acao: "criar", modulo: "usuarios", registroId: record.id, resumo: `Usuário ${data.nome} (${data.perfil}) · usuário "${username}" · matrícula ${data.matricula} · módulos: ${modulos}` });
  return toSessionUser(record);
}

const CAMPOS: Record<string, string> = { nome: "nome", email: "e-mail", username: "nome de usuário", matricula: "matrícula", setor: "setor", perfil: "perfil", permissoes: "módulos", status: "status" };

/**
 * Edição em Usuários. Administrador pode alterar qualquer campo de qualquer usuário
 * (inclusive matrícula, nome de usuário, e-mail, perfil, setor, módulos, status e senha).
 * Outros perfis com "Usuários: editar" não alteram matrícula de ninguém, não concedem
 * perfil Administrador, não editam administradores e só concedem módulos que possuem.
 * Ninguém (nem o administrador) altera o próprio perfil, módulos ou status. Tudo é auditado.
 */
export async function updateUser(repo: DataRepository, actor: SessionUser, id: string, input: z.input<typeof userUpdateSchema>, opts: { sessionToken?: string | null } = {}) {
  const parsed = userUpdateSchema.safeParse(input);
  if (!parsed.success) throw new TRPCError({ code: "BAD_REQUEST", message: parsed.error.issues.map(issue => issue.message).join("; ") });
  const existing = await repo.get<UserData>(USERS, actor.empresaId, id);
  if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Usuário não encontrado." });
  const { novaSenha, senhaAtual, ...rest } = parsed.data;
  const actorIsAdmin = isAdminPerfil(actor.perfil);
  const self = id === actor.id;
  const matriculaMuda = rest.matricula !== undefined && normalizeText(rest.matricula) !== normalizeText(existing.data.matricula);
  const emailMuda = rest.email !== undefined && normalizeEmail(rest.email) !== existing.data.email;
  const usernameMuda = rest.username !== undefined && normalizeUsername(rest.username) !== lower(existing.data.username);
  // B-01: qualquer alteração em quem tem acesso maior ou igual fica com o administrador
  if (!actorIsAdmin && !self) await assertStrictlyBelow(repo, actor, existing, "alterar os dados");
  if (!actorIsAdmin) {
    if (matriculaMuda) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Somente o administrador pode alterar a matrícula." });
    }
    if (isAdminPerfil(existing.data.perfil) || (rest.perfil && isAdminPerfil(rest.perfil))) {
      throw new TRPCError({ code: "FORBIDDEN", message: ADMIN_ONLY });
    }
  }
  // B-02: a própria senha, e-mail ou nome de usuário só mudam com a senha atual (como em Meu perfil)
  if (self && (novaSenha || emailMuda || usernameMuda)) conferirSenhaAtual(existing, senhaAtual, { code: "FORBIDDEN", ausente: SENHA_ATUAL_AUSENTE });
  const perfilMuda = rest.perfil !== undefined && rest.perfil !== existing.data.perfil;
  const statusMuda = rest.status !== undefined && rest.status !== existing.data.status;
  const permissoesMudam = rest.permissoes !== undefined && !samePermissions(rest.permissoes, existing.data.permissoes);
  if (!actorIsAdmin && permissoesMudam && !self) assertCanGrant(actor, rest.permissoes as Permissions, sanitizePermissions(existing.data.permissoes));
  const patch: Partial<UserData> = { ...rest } as Partial<UserData>;
  if (rest.email && normalizeEmail(rest.email) !== existing.data.email) {
    const other = await findUserByEmail(repo, rest.email);
    if (other && other.id !== id) throw new TRPCError({ code: "CONFLICT", message: EMAIL_INDISPONIVEL });
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
  if (id === actor.id && (perfilMuda || statusMuda || permissoesMudam)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Você não pode alterar o seu próprio perfil, módulos ou status. Peça a outro administrador." });
  }
  if (novaSenha) patch.senhaHash = hashUserPassword(novaSenha);
  const updated = (await repo.update<UserData>(USERS, actor.empresaId, id, patch, actorOf(actor))) as StoredRecord<UserData>;
  // a própria troca de senha mantém a sessão atual (como auth.changePassword); as demais caem
  if (patch.status === "Inativo" || novaSenha) await destroyUserSessions(repo, id, self ? opts.sessionToken ?? undefined : undefined);
  const mudancas = Object.keys(CAMPOS)
    .filter(key => key in patch && JSON.stringify((patch as Record<string, unknown>)[key]) !== JSON.stringify((existing.data as Record<string, unknown>)[key]))
    .map(key => key === "permissoes" ? `${CAMPOS[key]}: ${describePermissionChanges(existing.data.permissoes, patch.permissoes) || "sem mudança"}` : `${CAMPOS[key]}: "${String((existing.data as Record<string, unknown>)[key] ?? "")}" → "${String((patch as Record<string, unknown>)[key] ?? "")}"`);
  if (novaSenha) mudancas.push("senha redefinida");
  // B-03: a troca de matrícula (o administrador pode trocar a própria) fica explícita na trilha; a aprovação
  // de ocorrências usa o ID do usuário, então trocar a matrícula não libera analisar a própria ocorrência
  if (matriculaMuda) mudancas.push(`${self ? "o administrador trocou a PRÓPRIA matrícula" : "troca de matrícula pelo administrador"} (ponto, ocorrências e apontamentos da matrícula anterior não acompanham)`);
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
      await repo.update<UserData>(USERS, empresaId, user.id, { username }, systemActor(AUTOR_MIGRACAO));
      migrated++;
    }
    await audit(repo, empresaId, null, { autor: AUTOR_MIGRACAO, acao: "editar", modulo: "usuarios", resumo: `Migração automática: ${todo.length} usuário(s) receberam nome de usuário` });
  }
  return { migrated };
}

export async function deleteUser(repo: DataRepository, actor: SessionUser, id: string) {
  if (id === actor.id) throw new TRPCError({ code: "BAD_REQUEST", message: "Você não pode excluir o seu próprio usuário." });
  const existing = await repo.get<UserData>(USERS, actor.empresaId, id);
  if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Usuário não encontrado." });
  if (!isAdminPerfil(actor.perfil) && isAdminPerfil(existing.data.perfil)) throw new TRPCError({ code: "FORBIDDEN", message: ADMIN_ONLY });
  await assertStrictlyBelow(repo, actor, existing, "excluir o usuário");
  if (isAdminPerfil(existing.data.perfil) && existing.data.status === "Ativo" && (await countActiveAdmins(repo, actor.empresaId, id)) === 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "A empresa precisa de pelo menos um administrador ativo." });
  }
  await repo.softDelete(USERS, actor.empresaId, id, actorOf(actor));
  await destroyUserSessions(repo, id);
  await audit(repo, actor.empresaId, actor, { acao: "excluir", modulo: "usuarios", registroId: id, resumo: `Usuário ${existing.data.nome} (${existing.data.perfil}) · matrícula ${existing.data.matricula}` });
  return { success: true as const };
}

/** Data/hora em horário de Brasília para mensagens de linha de comando. */
export function formatBrasilia(iso: string | null | undefined) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return `${d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })} (horário de Brasília)`;
}

/** Usuários excluídos logicamente (para o comando de restauração). */
export async function listDeletedUsers(repo: DataRepository, empresaId: string) {
  const { items } = await repo.list<UserData>(USERS, empresaId, { includeDeleted: true, filter: (_data, record) => Boolean(record.deletedAt), sort: (a, b) => String(b.deletedAt).localeCompare(String(a.deletedAt)) });
  return items;
}

/**
 * P6-06: restaura um usuário excluído logicamente, procurando por id, e-mail, nome de usuário
 * ou matrícula (sem diferenciar maiúsculas). Recusa se o e-mail ou a matrícula já estiverem com
 * outra pessoa ativa; se o nome de usuário estiver em uso, gera outro livre. Sessões antigas não
 * voltam (foram encerradas na exclusão). Auditado com o autor informado (ex.: "Linha de comando").
 */
export async function restoreUser(repo: DataRepository, empresaId: string, identificador: string, opts: { autor: string }) {
  const id = identificador.trim().toLowerCase();
  if (!id) throw new Error("Informe o e-mail, nome de usuário, matrícula ou id do usuário excluído.");
  const deleted = await listDeletedUsers(repo, empresaId);
  const found = deleted.filter(user => user.id.toLowerCase() === id || lower(user.data.email) === id || lower(user.data.username) === id || lower(user.data.matricula) === id);
  if (found.length === 0) throw new Error(`Nenhum usuário excluído corresponde a "${identificador}" em ${empresaId}.`);
  if (found.length > 1) throw new Error(`"${identificador}" corresponde a ${found.length} usuários excluídos. Use o id: ${found.map(u => `${u.id} (${u.data.nome}, excluído em ${formatBrasilia(u.deletedAt)})`).join("; ")}.`);
  const user = found[0];
  const sameEmail = await findUserByEmail(repo, user.data.email);
  if (sameEmail) throw new Error(`O e-mail ${user.data.email} já pertence a outro usuário ativo (${sameEmail.data.nome}). Altere o e-mail dele antes de restaurar.`);
  await assertMatriculaFree(repo, empresaId, user.data.matricula, user.id).catch(error => { throw new Error(error.message); });
  let username = user.data.username || undefined;
  let usernameMotivo: "vazio" | "em uso" | null = username ? null : "vazio";
  try {
    if (username) await assertUsernameFree(repo, empresaId, username, user.id);
  } catch {
    username = undefined;
    usernameMotivo = "em uso";
  }
  if (!username) username = await uniqueUsername(repo, empresaId, usernameFromEmail(user.data.email), user.id);
  const usernameTrocado = usernameMotivo !== null;
  const actor = systemActor(opts.autor);
  await repo.restore(USERS, empresaId, user.id, actor);
  if (usernameTrocado) await repo.update<UserData>(USERS, empresaId, user.id, { username }, actor);
  await audit(repo, empresaId, null, { autor: opts.autor, acao: "restaurar", modulo: "usuarios", registroId: user.id, resumo: `Usuário ${user.data.nome} (${user.data.perfil}) restaurado · matrícula ${user.data.matricula} · usuário "${username}"${usernameMotivo === "em uso" ? ` (o anterior "${user.data.username}" estava em uso)` : usernameMotivo === "vazio" ? " (não tinha nome de usuário; recebeu um derivado do e-mail)" : ""} · status ${user.data.status}` });
  const restored = (await repo.get<UserData>(USERS, empresaId, user.id))!;
  return { user: toSessionUser(restored), usernameTrocado, usernameMotivo, usernameAnterior: user.data.username ?? null, excluidoEm: user.deletedAt ?? null };
}
