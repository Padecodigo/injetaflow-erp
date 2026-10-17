import type { Express, NextFunction, Request, Response } from "express";

/**
 * N01: o IP usado em bloqueio de login e limite do portal NUNCA vem de cabeçalho
 * controlado pelo cliente (X-Forwarded-For) a menos que um proxy confiável seja
 * configurado explicitamente em INJETAFLOW_TRUST_PROXY (ex.: "loopback", "1",
 * "10.0.0.0/8,127.0.0.1"). Sem isso, usamos o IP do socket.
 */
export function trustProxySetting(env: NodeJS.ProcessEnv = process.env): string | number | boolean | null {
  const raw = env.INJETAFLOW_TRUST_PROXY?.trim();
  if (!raw || raw === "false" || raw === "0") return null;
  if (raw === "true") return true;
  if (/^\d+$/.test(raw)) return Number(raw);
  return raw;
}

export function configureTrustProxy(app: Express, env: NodeJS.ProcessEnv = process.env) {
  const setting = trustProxySetting(env);
  app.set("trust proxy", setting ?? false);
  if (setting !== null) console.log(`[InjetaFlow] trust proxy habilitado: ${String(setting)}`);
}

type ReqLike = Pick<Request, "ip" | "socket"> & { app?: { get?: (key: string) => unknown } };

export function clientIp(req: ReqLike): string {
  const trusted = typeof req.app?.get === "function" && Boolean(req.app.get("trust proxy"));
  const ip = trusted ? req.ip : req.socket?.remoteAddress;
  return (ip || req.socket?.remoteAddress || "local").toString();
}


/**
 * N16: "/dashboard/" → 301 para "/dashboard" (mantém a query). Não mexe em /api nem na raiz.
 * Barras iniciais repetidas são normalizadas para evitar redirecionamento aberto ("//site.com/").
 */
export function trailingSlashRedirect(req: Request, res: Response, next: NextFunction) {
  if ((req.method !== "GET" && req.method !== "HEAD") || req.path.length <= 1 || !req.path.endsWith("/") || req.path.startsWith("/api/")) return next();
  const target = req.path.replace(/\/+$/, "").replace(/^\/+/, "/") || "/";
  const queryIndex = req.originalUrl.indexOf("?");
  const query = queryIndex >= 0 ? req.originalUrl.slice(queryIndex) : "";
  res.redirect(301, target + query);
}
