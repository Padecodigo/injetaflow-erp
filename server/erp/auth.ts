import { createHash, randomBytes } from "node:crypto";
import { TRPCError } from "@trpc/server";
import type { CookieOptions, Request, Response } from "express";
import { parse as parseCookie } from "cookie";
import { PERMISSION_KEYS, PERFIS, type AccessLevel, type Permissions } from "@shared/erp/modules";
import type { DataRepository, StoredRecord } from "./repository";
import { hashPassword, verifyPassword } from "./password";
import { identifierKind, normalizeIdentifier, normalizeUsername } from "@shared/erp/account";
import type { SessionData, SessionUser, UserData } from "./types";
import { publicEmpresaId } from "./store";

export const SESSION_COOKIE = "injetaflow_session";
export const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 h

export const USERS = "usuarios";
export const SESSIONS = "sessoes";

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function toSessionUser(record: StoredRecord<UserData>): SessionUser {
  const { senhaHash: _omit, ...rest } = record.data;
  return { id: record.id, empresaId: record.empresaId, ...rest, permissoes: sanitizePermissions(rest.permissoes) };
}

export function sanitizePermissions(input: unknown): Permissions {
  const out: Permissions = {};
  if (!input || typeof input !== "object") return out;
  for (const key of PERMISSION_KEYS) {
    const value = (input as Record<string, unknown>)[key];
    if (value === "ver" || value === "editar") out[key] = value as AccessLevel;
  }
  return out;
}

export function isValidPerfil(perfil: string): boolean {
  return (PERFIS as readonly string[]).includes(perfil);
}

// ---------- limitação de tentativas de login (memória do processo) ----------
const failures = new Map<string, number[]>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;
/** N01: limite por identificador/conta, independente do IP (impede força bruta distribuída). */
export const MAX_FAILURES_PER_EMAIL = 10;
export const MAX_FAILURES_PER_ACCOUNT = MAX_FAILURES_PER_EMAIL;

export function isLoginLocked(key: string, now = Date.now(), max = MAX_FAILURES): boolean {
  const recent = (failures.get(key) ?? []).filter(ts => now - ts < WINDOW_MS);
  failures.set(key, recent);
  return recent.length >= max;
}
export function registerLoginFailure(key: string, now = Date.now()) {
  failures.set(key, [...(failures.get(key) ?? []).filter(ts => now - ts < WINDOW_MS), now]);
}
export function clearLoginFailures(key: string) {
  failures.delete(key);
}
export function resetLoginLimiter() {
  failures.clear();
}

/**
 * B-12: tentativas da senha atual (troca de senha, e-mail ou nome de usuário da própria conta) têm o
 * mesmo limite do login, por usuário: 5 erros em 15 minutos → TOO_MANY_REQUESTS. Uma sessão roubada
 * não serve para descobrir a senha por força bruta.
 */
export const MAX_FALHAS_SENHA_ATUAL = 5;
export const SENHA_ATUAL_BLOQUEADA = "Muitas tentativas com a senha atual errada. Aguarde 15 minutos e tente de novo.";

export function conferirSenhaAtual(user: StoredRecord<UserData>, senhaAtual: string | undefined, opts: { code: "BAD_REQUEST" | "FORBIDDEN"; ausente: string }) {
  const key = `senha-atual|${user.id}`;
  if (isLoginLocked(key, Date.now(), MAX_FALHAS_SENHA_ATUAL)) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: SENHA_ATUAL_BLOQUEADA });
  if (!senhaAtual) throw new TRPCError({ code: opts.code, message: opts.ausente });
  if (!verifyPassword(senhaAtual, user.data.senhaHash)) {
    registerLoginFailure(key);
    throw new TRPCError({ code: opts.code, message: "Senha atual incorreta." });
  }
  clearLoginFailures(key);
}

// ---------- usuários ----------
export async function findUserByEmail(repo: DataRepository, email: string) {
  const normalized = normalizeEmail(email);
  return repo.findGlobal<UserData>(USERS, data => data.email === normalized);
}

export async function findUserByUsername(repo: DataRepository, empresaId: string, username: string, ignoreId?: string) {
  const wanted = normalizeUsername(username);
  const { items } = await repo.list<UserData>(USERS, empresaId, { filter: (data, record) => record.id !== ignoreId && normalizeUsername(data.username ?? "") === wanted, limit: 1 });
  return items[0] ?? null;
}

/**
 * Login flexível: identifica se o texto é e-mail, nome de usuário ou matrícula.
 * Com "@" é e-mail; sem "@", procura primeiro por nome de usuário e depois por matrícula
 * (comparação sem diferenciar maiúsculas). Devolve os candidatos na ordem de preferência.
 *
 * B-08: nome de usuário e matrícula são únicos só dentro da empresa, então a busca tem escopo de
 * empresa (`escoparEmpresa`): cada tentativa é conferida em UMA empresa, nunca "na que a senha bater".
 */
export async function findLoginCandidates(repo: DataRepository, identifier: string, empresa?: string | null): Promise<StoredRecord<UserData>[]> {
  const id = normalizeIdentifier(identifier);
  if (!id) return [];
  if (identifierKind(id) === "email") {
    const user = await findUserByEmail(repo, id);
    return escoparEmpresa(user ? [user] : [], empresa);
  }
  const byUsername = await repo.findAllGlobal<UserData>(USERS, data => normalizeUsername(data.username ?? "") === id);
  const byMatricula = await repo.findAllGlobal<UserData>(USERS, data => String(data.matricula ?? "").trim().toLowerCase() === id);
  const seen = new Set<string>();
  return escoparEmpresa([...byUsername, ...byMatricula].filter(record => (seen.has(record.id) ? false : (seen.add(record.id), true))), empresa);
}

/**
 * B-08: com `empresa` informada (login com `?empresa=`), só contas dessa empresa. Sem ela: se o
 * identificador existe numa empresa só, é ela; se existe em várias, vale só a empresa padrão
 * (`INJETAFLOW_PUBLIC_EMPRESA`, a da instalação). Nunca se testa a senha em várias empresas.
 */
export function escoparEmpresa<T extends { empresaId: string }>(candidates: T[], empresa?: string | null, padrao = publicEmpresaId()): T[] {
  const alvo = empresa?.trim();
  if (alvo) return candidates.filter(c => c.empresaId === alvo);
  if (new Set(candidates.map(c => c.empresaId)).size <= 1) return candidates;
  return candidates.filter(c => c.empresaId === padrao);
}

const DUMMY_HASH = "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==";

/** Retorna o usuário, "inativo" (senha certa, mas usuário desativado — N12) ou null. */
export async function authenticate(repo: DataRepository, identifier: string, password: string, candidates?: StoredRecord<UserData>[]): Promise<StoredRecord<UserData> | "inativo" | null> {
  const users = candidates ?? (await findLoginCandidates(repo, identifier));
  if (users.length === 0) {
    // custo equivalente para não revelar se o identificador existe
    verifyPassword(password, DUMMY_HASH);
    return null;
  }
  for (const user of users) {
    if (!verifyPassword(password, user.data.senhaHash)) continue;
    // só revela o estado "inativo" a quem acertou a senha (não permite enumerar contas)
    return user.data.status === "Ativo" ? user : "inativo";
  }
  return null;
}

export async function createSession(repo: DataRepository, user: StoredRecord<UserData>, ip?: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await repo.insert<SessionData>(SESSIONS, user.empresaId, { tokenHash: sha256(token), userId: user.id, expiresAt: expiresAt.toISOString(), ip });
  await repo.update<UserData>(USERS, user.empresaId, user.id, { ultimoAcesso: new Date().toISOString() });
  // limpeza oportunista de sessões vencidas
  const now = new Date().toISOString();
  await repo.purge(SESSIONS, record => String((record.data as SessionData).expiresAt) < now);
  return { token, expiresAt };
}

export async function getUserFromToken(repo: DataRepository, token: string | undefined | null): Promise<SessionUser | null> {
  if (!token) return null;
  const tokenHash = sha256(token);
  const session = await repo.findGlobal<SessionData>(SESSIONS, data => data.tokenHash === tokenHash);
  if (!session || session.data.expiresAt < new Date().toISOString()) return null;
  const user = await repo.get<UserData>(USERS, session.empresaId, session.data.userId);
  if (!user || user.data.status !== "Ativo") return null;
  return toSessionUser(user);
}

export async function destroySession(repo: DataRepository, token: string | undefined | null) {
  if (!token) return;
  const tokenHash = sha256(token);
  await repo.purge(SESSIONS, record => (record.data as SessionData).tokenHash === tokenHash);
}

export async function destroyUserSessions(repo: DataRepository, userId: string, exceptToken?: string) {
  const keep = exceptToken ? sha256(exceptToken) : null;
  await repo.purge(SESSIONS, record => {
    const data = record.data as SessionData;
    return data.userId === userId && data.tokenHash !== keep;
  });
}

export function hashUserPassword(password: string) {
  return hashPassword(password);
}

// ---------- cookie ----------
// req.protocol só considera X-Forwarded-Proto quando "trust proxy" está configurado (N01)
function isHttps(req: Request): boolean {
  return req.protocol === "https";
}

export function sessionCookieOptions(req: Request): CookieOptions {
  const forceInsecure = process.env.INJETAFLOW_COOKIE_SECURE === "false";
  const secure = !forceInsecure && (isHttps(req) || process.env.NODE_ENV === "production");
  return { httpOnly: true, sameSite: "lax", secure, path: "/" };
}

export function readSessionToken(req: Request): string | null {
  const header = req.headers?.cookie;
  if (!header) return null;
  const parsed = parseCookie(header);
  return parsed[SESSION_COOKIE] ?? null;
}

export function setSessionCookie(req: Request, res: Response, token: string, expiresAt: Date) {
  res.cookie(SESSION_COOKIE, token, { ...sessionCookieOptions(req), expires: expiresAt });
}

export function clearSessionCookie(req: Request, res: Response) {
  res.clearCookie(SESSION_COOKIE, sessionCookieOptions(req));
}
