import { PERFIL_PRESETS, type Permissions } from "@shared/erp/modules";
import { appRouter } from "../../routers";
import type { TrpcContext } from "../../_core/context";
import { MemoryRepository, type DataRepository } from "../repository";
import { getUserFromToken, resetLoginLimiter, SESSION_COOKIE } from "../auth";
import { createUser } from "../users";
import { resetPublicRate } from "../publico";

export type CookieJar = { set: Record<string, { value: string; options: Record<string, unknown> }>; cleared: { name: string; options: Record<string, unknown> }[] };

export function fakeHttp(token?: string | null, ip = "10.0.0.1", extraHeaders: Record<string, string> = {}, trustProxy = false) {
  const jar: CookieJar = { set: {}, cleared: [] };
  const forwarded = extraHeaders["x-forwarded-for"]?.split(",")[0].trim();
  const req = {
    protocol: "http",
    headers: { ...(token ? { cookie: `${SESSION_COOKIE}=${token}` } : {}), ...extraHeaders },
    // como o Express: req.ip só usa X-Forwarded-For com trust proxy
    ip: trustProxy && forwarded ? forwarded : ip,
    socket: { remoteAddress: ip },
    app: { get: (key: string) => (key === "trust proxy" ? trustProxy : undefined) },
  } as unknown as TrpcContext["req"];
  const res = {
    cookie: (name: string, value: string, options: Record<string, unknown>) => { jar.set[name] = { value, options }; },
    clearCookie: (name: string, options: Record<string, unknown>) => { jar.cleared.push({ name, options }); },
  } as unknown as TrpcContext["res"];
  return { req, res, jar };
}

export async function callerFor(repo: DataRepository, token?: string | null, ip?: string, extraHeaders?: Record<string, string>, trustProxy?: boolean) {
  const { req, res, jar } = fakeHttp(token, ip, extraHeaders, trustProxy);
  const user = await getUserFromToken(repo, token ?? null);
  const ctx: TrpcContext = { req, res, user, repo, sessionToken: token ?? null };
  return { caller: appRouter.createCaller(ctx), jar, ctx };
}

export const ADMIN = { email: "admin@teste.local", senha: "Senha-Admin-123" };

export async function setup(empresaId = "empresa-a") {
  resetLoginLimiter();
  resetPublicRate();
  const repo = new MemoryRepository();
  await createUser(repo, null, empresaId, { nome: "Admin Teste", email: ADMIN.email, senha: ADMIN.senha, setor: "Administrativo", perfil: "Administrador", matricula: "ADM-0001", permissoes: PERFIL_PRESETS.Administrador, status: "Ativo" });
  const admin = await login(repo, ADMIN.email, ADMIN.senha);
  return { repo, admin, empresaId };
}

export async function login(repo: DataRepository, email: string, senha: string) {
  const anon = await callerFor(repo);
  await anon.caller.auth.login({ email, password: senha });
  const token = anon.jar.set[SESSION_COOKIE].value;
  const authed = await callerFor(repo, token);
  return { ...authed, token, loginJar: anon.jar };
}

export async function createAndLogin(repo: DataRepository, empresaId: string, opts: { email: string; perfil?: string; permissoes?: Permissions; matricula?: string }) {
  const senha = "Senha-Usuario-123";
  await createUser(repo, null, empresaId, { nome: `Usuário ${opts.email}`, email: opts.email, senha, setor: "Produção", perfil: (opts.perfil ?? "Operador") as "Operador", matricula: opts.matricula ?? `MAT-${opts.email.slice(0, 4).toUpperCase()}`, permissoes: opts.permissoes ?? {}, status: "Ativo" });
  return login(repo, opts.email, senha);
}
