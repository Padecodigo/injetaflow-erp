import type { Express, Request } from "express";

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
