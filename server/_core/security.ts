import type { NextFunction, Request, RequestHandler, Response } from "express";

/**
 * B-06: cabeçalhos de segurança de todas as respostas (páginas, API e arquivos estáticos).
 *
 * - CSP: em produção só scripts do próprio site (o build do Vite não tem script inline); estilos
 *   inline são permitidos porque os componentes (Radix, sonner) usam `style`. Em desenvolvimento o
 *   Vite injeta o preâmbulo do React Refresh inline e usa WebSocket para o HMR, então o modo dev
 *   libera `'unsafe-inline'`/`'unsafe-eval'` em scripts e `ws:`/`wss:` em conexões.
 * - `frame-ancestors 'none'` + `X-Frame-Options: DENY`: nenhuma tela pode ser embutida (clickjacking).
 * - HSTS só em produção (`NODE_ENV=production`); em http o navegador ignora o cabeçalho, então uma
 *   instalação local em http continua funcionando.
 * - nosniff, Referrer-Policy, Permissions-Policy e Cross-Origin-Opener-Policy sempre.
 */
export type SecurityOptions = {
  mode: "development" | "production" | "test" | string | undefined;
  /** Origens extras (ex.: a do MANUS_API_URL, se configurado) para scripts e conexões. */
  extraOrigins?: string[];
};

const FONTES_CSS = "https://fonts.googleapis.com";
const FONTES_ARQUIVOS = "https://fonts.gstatic.com";

export function contentSecurityPolicy(opts: SecurityOptions): string {
  const dev = opts.mode === "development";
  const extras = (opts.extraOrigins ?? []).filter(Boolean);
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", ...(dev ? ["'unsafe-inline'", "'unsafe-eval'"] : []), ...extras],
    "style-src": ["'self'", "'unsafe-inline'", FONTES_CSS],
    "font-src": ["'self'", "data:", FONTES_ARQUIVOS],
    "img-src": ["'self'", "data:", "blob:"],
    "connect-src": ["'self'", ...(dev ? ["ws:", "wss:"] : []), ...extras],
    "worker-src": ["'self'", "blob:"],
    "manifest-src": ["'self'"],
    "frame-src": ["'none'"],
    "frame-ancestors": ["'none'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
  };
  return Object.entries(directives).map(([key, values]) => `${key} ${values.join(" ")}`).join("; ");
}

export const HSTS = "max-age=15552000"; // 180 dias, sem includeSubDomains (o domínio pode ter outros serviços)
export const PERMISSIONS_POLICY = "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()";

export function securityHeaders(opts: SecurityOptions): RequestHandler {
  const csp = contentSecurityPolicy(opts);
  const production = opts.mode === "production";
  return (req: Request, res: Response, next: NextFunction) => {
    res.setHeader("Content-Security-Policy", csp);
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", PERMISSIONS_POLICY);
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    if (production) res.setHeader("Strict-Transport-Security", HSTS);
    // respostas da API com dados da sessão não ficam em cache de navegador ou proxy
    if (req.path.startsWith("/api/trpc") || req.path.startsWith("/api/anexos")) res.setHeader("Cache-Control", "no-store");
    next();
  };
}

/** Origem (esquema + host) de uma URL configurada, ou null se vazia/inválida. */
export function originOf(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.origin : null;
  } catch {
    return null;
  }
}

/**
 * B-13: limita quantos procedimentos cabem numa requisição em lote do tRPC (`/api/trpc/a,b,c?batch=1`).
 * Sem isso, 300 procedimentos numa única requisição passavam (amplificação). O front faz poucos por vez.
 */
export const MAX_TRPC_BATCH = 50;
export function limitTrpcBatch(max = MAX_TRPC_BATCH): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const paths = decodeURIComponent(req.path.replace(/^\/+/, "")).split(",").filter(Boolean);
    if (paths.length > max) {
      res.status(400).json({ error: `Requisição em lote com ${paths.length} procedimentos; o máximo é ${max}.` });
      return;
    }
    next();
  };
}
