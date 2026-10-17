import { createHash, randomBytes } from "node:crypto";
import type { CookieOptions, Request, Response } from "express";
import { parse as parseCookie } from "cookie";
import { PERMISSION_KEYS, PERFIS, type AccessLevel, type Permissions } from "@shared/erp/modules";
import type { DataRepository, StoredRecord } from "./repository";
import { hashPassword, verifyPassword } from "./password";
import type { SessionData, SessionUser, UserData } from "./types";

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

export function isLoginLocked(key: string, now = Date.now()): boolean {
  const recent = (failures.get(key) ?? []).filter(ts => now - ts < WINDOW_MS);
  failures.set(key, recent);
  return recent.length >= MAX_FAILURES;
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

// ---------- usuários ----------
export async function findUserByEmail(repo: DataRepository, email: string) {
  const normalized = normalizeEmail(email);
  return repo.findGlobal<UserData>(USERS, data => data.email === normalized);
}

export async function authenticate(repo: DataRepository, email: string, password: string): Promise<StoredRecord<UserData> | null> {
  const user = await findUserByEmail(repo, email);
  if (!user) {
    // custo equivalente para não revelar se o e-mail existe
    verifyPassword(password, "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==");
    return null;
  }
  if (user.data.status !== "Ativo") return null;
  return verifyPassword(password, user.data.senhaHash) ? user : null;
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
function isHttps(req: Request): boolean {
  if (req.protocol === "https") return true;
  const forwarded = req.headers?.["x-forwarded-proto"];
  const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return typeof value === "string" && value.split(",")[0].trim() === "https";
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
  res.clearCookie(SESSION_COOKIE, { ...sessionCookieOptions(req), maxAge: -1 });
}
