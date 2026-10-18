import express from "express";
import fs from "node:fs";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PERFIL_PRESETS } from "@shared/erp/modules";
import { registerErpHttpRoutes } from "../http";
import { setRepository } from "../store";
import { SESSION_COOKIE } from "../auth";
import { callerFor, createAndLogin, setup } from "./helpers";
import { pastaTemporaria, subirServidor, type ServidorReal } from "./helpers-servidor-dados";

/**
 * Cobertura pedida na auditoria: download de anexos (/api/anexos/:id, fora do tRPC) e a montagem do
 * Express (saúde, limites de corpo, API inexistente, tRPC).
 */
describe("/api/anexos/:id (integração, Express em processo)", () => {
  const dir = pastaTemporaria("anexos-");
  const envAntes = process.env.INJETAFLOW_DATA_DIR;
  let base = "";
  let server: ReturnType<ReturnType<typeof express>["listen"]>;
  let ctx: Awaited<ReturnType<typeof setup>>;
  let solicitacaoId = "";
  const pdf = Buffer.from("%PDF-1.4\nconteúdo do desenho\n%%EOF");

  beforeAll(async () => {
    process.env.INJETAFLOW_DATA_DIR = dir;
    ctx = await setup("wamovale");
    setRepository(ctx.repo);
    const anon = await callerFor(ctx.repo, null, "10.8.0.1");
    await anon.caller.publico.enviarSolicitacao({ tipo: "Cotação", nome: "Cliente", empresa: "ACME", email: "c@acme.com", necessidade: "Peça", etapa: "Projeto", volume: "1000", material: "PP", consentimento: true, anexo: { nome: "desenho.pdf", base64: pdf.toString("base64") } });
    const lista = await ctx.admin.caller.records.list({ module: "solicitacoes" });
    solicitacaoId = String(lista.items[0].id);
    const app = express();
    registerErpHttpRoutes(app);
    server = app.listen(0);
    await new Promise(r => server.once("listening", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => {
    server?.close();
    setRepository(null);
    if (envAntes === undefined) delete process.env.INJETAFLOW_DATA_DIR;
    else process.env.INJETAFLOW_DATA_DIR = envAntes;
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const baixar = (id: string, token?: string) => fetch(`${base}/api/anexos/${id}`, { headers: token ? { cookie: `${SESSION_COOKIE}=${token}` } : {} });

  it("sem sessão → 401", async () => {
    expect((await baixar(solicitacaoId)).status).toBe(401);
    expect((await baixar(solicitacaoId, "token-falso")).status).toBe(401);
  });

  it("sessão sem permissão em Solicitações → 403", async () => {
    const op = await createAndLogin(ctx.repo, "wamovale", { email: "op@teste.local", permissoes: PERFIL_PRESETS.Operador });
    expect((await baixar(solicitacaoId, op.token)).status).toBe(403);
  });

  it("id inexistente ou de outra empresa → 404", async () => {
    expect((await baixar("nao-existe", ctx.admin.token)).status).toBe(404);
    const outra = await createAndLogin(ctx.repo, "outra-empresa", { email: "adm2@teste.local", perfil: "Administrador", permissoes: PERFIL_PRESETS.Administrador });
    expect((await baixar(solicitacaoId, outra.token)).status).toBe(404);
  });

  it("com permissão → 200, o arquivo certo, como download, sem cache", async () => {
    const res = await baixar(solicitacaoId, ctx.admin.token);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toMatch(/attachment; filename="desenho\.pdf"/);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(Buffer.from(await res.arrayBuffer()).equals(pdf)).toBe(true);
    // o arquivo fica na pasta de dados (volume), separado por empresa
    expect(fs.readdirSync(path.join(dir, "uploads", "wamovale"))).toHaveLength(1);
  });
});

describe("montagem do Express (integração, servidor real em produção)", () => {
  const dir = pastaTemporaria("montagem-");
  let srv: ServidorReal;
  beforeAll(async () => {
    srv = await subirServidor(dir);
  }, 60_000);
  afterAll(async () => {
    await srv?.parar();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const url = (p: string) => `http://127.0.0.1:${srv.porta}${p}`;

  it("saúde, id da pasta de dados e config pública", async () => {
    expect(await (await fetch(url("/api/health"))).json()).toEqual({ status: "ok" });
    expect((await (await fetch(url("/api/health/dados"))).json()).dados).toMatch(/^[0-9a-f]{16}$/);
    expect((await fetch(url("/api/platform/config.js"))).headers.get("cache-control")).toBe("no-store");
  });

  it("tRPC montado em /api/trpc (consulta sem sessão responde, mutation exige dados válidos)", async () => {
    const me = await fetch(url("/api/trpc/auth.me?batch=1&input=%7B%7D"));
    expect(me.status).toBe(200);
    const login = await fetch(url("/api/trpc/auth.login?batch=1"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ 0: { json: { email: "ninguem", password: "errada-123" } } }) });
    expect(login.status).toBe(401);
  });

  it("corpo acima do limite → 413; API inexistente → 404 em JSON; anexo sem sessão → 401", async () => {
    const grande = await fetch(url("/api/trpc/publico.enviarSolicitacao?batch=1"), { method: "POST", headers: { "content-type": "application/json" }, body: `{"x":"${"a".repeat(9 * 1024 * 1024)}"}` });
    expect(grande.status).toBe(413);
    const inexistente = await fetch(url("/api/nao-existe"));
    expect(inexistente.status).toBe(404);
    expect(await inexistente.json()).toEqual({ error: "Rota de API inexistente." });
    expect((await fetch(url("/api/anexos/qualquer"))).status).toBe(401);
  });

  it("cabeçalhos básicos e sem x-powered-by", async () => {
    const res = await fetch(url("/api/health"));
    expect(res.headers.get("x-powered-by")).toBeNull();
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });
});
