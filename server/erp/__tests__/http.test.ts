import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appRouter } from "../../routers";
import { MemoryRepository } from "../repository";
import { trailingSlashRedirect } from "../net";
import { resetPublicRate } from "../publico";

let server: Server;
let base = "";

beforeAll(async () => {
  resetPublicRate();
  const repo = new MemoryRepository();
  const app = express();
  app.use(trailingSlashRedirect);
  app.use(express.json({ limit: "8mb" }));
  app.use("/api/trpc", createExpressMiddleware({ router: appRouter, createContext: ({ req, res }) => ({ req, res, user: null, repo, sessionToken: null }) }));
  app.get("/api/x/", (_req, res) => res.send("api ok"));
  app.get(/.*/, (req, res) => res.send(`spa ${req.path}`));
  server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>(resolve => server.close(() => resolve())));

describe("N15 — API pública devolve erro legível", () => {
  it("N15: entrada inválida volta com mensagem em texto (não array JSON do Zod) e detalhes por campo", async () => {
    const r = await fetch(`${base}/api/trpc/publico.enviarSolicitacao`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ json: { tipo: "Contato", nome: "A", email: "nao-e-email", assunto: "Comercial", mensagem: "oi", consentimento: true, telefone: "abc" } }),
    });
    expect(r.status).toBe(400);
    const body = await r.json() as { error: { json: { message: string; data: { fieldErrors?: Record<string, string> } } } };
    const { message, data } = body.error.json;
    expect(message.trim().startsWith("[")).toBe(false);
    expect(() => JSON.parse(message)).toThrow();
    expect(message).toMatch(/Informe seu nome/);
    expect(message).toMatch(/E-mail inválido/);
    expect(message).toMatch(/Telefone inválido/);
    expect(data.fieldErrors).toMatchObject({ email: "E-mail inválido" });
  });

  it("N15: tipo desconhecido também vira texto", async () => {
    const r = await fetch(`${base}/api/trpc/publico.enviarSolicitacao`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ json: { tipo: "Spam" } }) });
    const body = await r.json() as { error: { json: { message: string } } };
    expect(body.error.json.message.startsWith("[")).toBe(false);
    expect(body.error.json.message.length).toBeGreaterThan(5);
  });
});

describe("N16 — barra final redireciona", () => {
  it("N16: /dashboard/ → 301 /dashboard (mantém query); raiz e /api intactas", async () => {
    const r = await fetch(`${base}/dashboard/?periodo=7d`, { redirect: "manual" });
    expect(r.status).toBe(301);
    expect(r.headers.get("location")).toBe("/dashboard?periodo=7d");
    const multi = await fetch(`${base}/erp/ordens//`, { redirect: "manual" });
    expect(multi.headers.get("location")).toBe("/erp/ordens");
    expect((await fetch(`${base}/`, { redirect: "manual" })).status).toBe(200);
    expect((await fetch(`${base}/api/x/`, { redirect: "manual" })).status).toBe(200);
  });

  it("N16: não vira redirecionamento aberto (//site-externo/)", async () => {
    const r = await fetch(`${base}//evil.example/`, { redirect: "manual" });
    expect(r.status).toBe(301);
    expect(r.headers.get("location")).toBe("/evil.example");
  });
});
