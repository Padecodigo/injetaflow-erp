// Auditoria back-end, B-06 (média): o servidor só enviava nosniff e Referrer-Policy. Sem CSP, sem X-Frame-Options /
// frame-ancestors (clickjacking nas telas de Usuários e Configurações), sem HSTS em produção e sem Permissions-Policy.
// Unitário (middleware e CSP por modo) + integração com o servidor real (server/_core/index.ts) em produção.
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { contentSecurityPolicy, limitTrpcBatch, MAX_TRPC_BATCH, originOf, securityHeaders } from "../../_core/security";
import { generatePassword } from "../password";

const root = path.resolve(__dirname, "../../..");

async function portaLivre(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address() as net.AddressInfo;
      srv.close(() => resolve(port));
    });
  });
}

describe("B-06: CSP por modo (unitário)", () => {
  it("produção: só scripts do próprio site, sem inline/eval; frame-ancestors 'none'; fontes do Google liberadas", () => {
    const csp = contentSecurityPolicy({ mode: "production" });
    expect(csp).toMatch(/script-src 'self'(;|$)/);
    expect(csp).not.toMatch(/unsafe-eval/);
    expect(csp).toMatch(/frame-ancestors 'none'/);
    expect(csp).toMatch(/object-src 'none'/);
    expect(csp).toMatch(/base-uri 'self'/);
    expect(csp).toMatch(/style-src 'self' 'unsafe-inline' https:\/\/fonts\.googleapis\.com/);
    expect(csp).toMatch(/font-src [^;]*https:\/\/fonts\.gstatic\.com/);
    expect(csp).toMatch(/connect-src 'self'(;|$)/);
  });

  it("desenvolvimento (Vite): preâmbulo inline do React Refresh e WebSocket do HMR liberados", () => {
    const csp = contentSecurityPolicy({ mode: "development" });
    expect(csp).toMatch(/script-src 'self' 'unsafe-inline' 'unsafe-eval'/);
    expect(csp).toMatch(/connect-src 'self' ws: wss:/);
    expect(csp).toMatch(/frame-ancestors 'none'/);
  });

  it("origem extra configurada (MANUS_API_URL) entra em script-src e connect-src; URL inválida é ignorada", () => {
    expect(originOf("https://api.exemplo.com/v1/")).toBe("https://api.exemplo.com");
    expect(originOf("javascript:alert(1)")).toBeNull();
    expect(originOf("")).toBeNull();
    const csp = contentSecurityPolicy({ mode: "production", extraOrigins: ["https://api.exemplo.com"] });
    expect(csp).toMatch(/script-src 'self' https:\/\/api\.exemplo\.com/);
    expect(csp).toMatch(/connect-src 'self' https:\/\/api\.exemplo\.com/);
  });
});

describe("B-06/B-13: middlewares numa app Express (integração)", () => {
  let base = "";
  let close: () => void = () => undefined;
  beforeAll(async () => {
    const app = express();
    app.use(securityHeaders({ mode: "development" }));
    app.use("/api/trpc", limitTrpcBatch(), (_req, res) => res.json({ ok: true }));
    app.get("/pagina", (_req, res) => res.send("<html></html>"));
    const server = app.listen(0, "127.0.0.1");
    await new Promise(r => server.once("listening", r));
    base = `http://127.0.0.1:${(server.address() as net.AddressInfo).port}`;
    close = () => server.close();
  });
  afterAll(() => close());

  it("HSTS só em produção; no-store nas respostas da API", async () => {
    const pagina = await fetch(`${base}/pagina`);
    expect(pagina.headers.get("strict-transport-security")).toBeNull();
    expect(pagina.headers.get("x-frame-options")).toBe("DENY");
    expect(pagina.headers.get("cache-control") ?? "").not.toMatch(/no-store/);
    const api = await fetch(`${base}/api/trpc/auth.me`);
    expect(api.headers.get("cache-control")).toBe("no-store");
  });

  it(`lote do tRPC acima de ${MAX_TRPC_BATCH} procedimentos é recusado (400); lote normal passa`, async () => {
    const muitos = Array.from({ length: 300 }, () => "auth.me").join(",");
    expect((await fetch(`${base}/api/trpc/${muitos}?batch=1`)).status).toBe(400);
    expect((await fetch(`${base}/api/trpc/auth.me,records.list?batch=1`)).status).toBe(200);
  });
});

describe("B-06: servidor real em produção (server/_core/index.ts)", () => {
  let proc: ChildProcess | undefined;
  let base = "";
  let dir = "";

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "b06-"));
    const port = await portaLivre();
    base = `http://127.0.0.1:${port}`;
    proc = spawn(path.join(root, "node_modules", ".bin", "tsx"), ["server/_core/index.ts"], {
      cwd: root,
      env: { ...process.env, NODE_ENV: "production", PORT: String(port), INJETAFLOW_DATA_DIR: dir, INJETAFLOW_ADMIN_PASSWORD: generatePassword(14), INJETAFLOW_SEED_DEMO: "false", INJETAFLOW_COOKIE_SECURE: "false" },
      stdio: "ignore",
    });
    for (let i = 0; i < 120; i++) {
      try { if ((await fetch(`${base}/api/health`)).ok) return; } catch { /* subindo */ }
      await new Promise(r => setTimeout(r, 250));
    }
    throw new Error("servidor não subiu");
  }, 45_000);
  afterAll(() => { proc?.kill(); if (dir) fs.rmSync(dir, { recursive: true, force: true }); });

  it("API e páginas enviam CSP com frame-ancestors, X-Frame-Options, Permissions-Policy, nosniff e Referrer-Policy", async () => {
    for (const p of ["/api/health", "/", "/erp", "/api/platform/config.js"]) {
      const r = await fetch(base + p);
      expect(r.headers.get("content-security-policy") ?? "", p).toMatch(/frame-ancestors 'none'/);
      expect(r.headers.get("content-security-policy") ?? "", p).not.toMatch(/unsafe-eval/);
      expect(r.headers.get("x-frame-options"), p).toBe("DENY");
      expect(r.headers.get("permissions-policy"), p).toBeTruthy();
      expect(r.headers.get("x-content-type-options"), p).toBe("nosniff");
      expect(r.headers.get("referrer-policy"), p).toBe("strict-origin-when-cross-origin");
      expect(r.headers.get("x-powered-by"), p).toBeNull();
    }
  });

  it("em produção envia HSTS", async () => {
    const r = await fetch(`${base}/api/health`);
    expect(r.headers.get("strict-transport-security") ?? "").toMatch(/max-age=\d+/);
  });

  it("tRPC com lote gigante → 400", async () => {
    const muitos = Array.from({ length: 300 }, () => "auth.me").join(",");
    expect((await fetch(`${base}/api/trpc/${muitos}?batch=1&input=${encodeURIComponent("{}")}`)).status).toBe(400);
  });
});
