import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { appRouter } from "../../routers";
import { JsonFileRepository } from "../repository";
import { CURRICULOS_DESATIVADOS_MSG, resetPublicRate } from "../publico";

/**
 * Spec Segurança LGPD (R4/R5, PR fix/auditoria-frontend-ux): envio de currículo pelo portal desligado.
 * Integração HTTP real (Express + tRPC + JsonFileRepository em pasta temporária), sem UI:
 * com PORTAL_CURRICULOS_ATIVO ausente/false o endpoint responde 403 antes de ler ou gravar qualquer coisa;
 * o arquivo do store e o diretório de anexos ficam idênticos (antes/depois).
 */
const EMPRESA = "empresa-cv";
const pdf = Buffer.from("%PDF-1.4 curriculo de teste (dado fictício)").toString("base64");
const curriculo = { tipo: "Currículo", nome: "Candidata Fictícia", email: "candidata@teste.local", area: "Qualidade", consentimento: true, anexo: { nome: "cv.pdf", base64: pdf } };

let tmp = "";
let storeFile = "";
let uploadsDir = "";
let server: Server;
let base = "";

function snapshot() {
  const store = fs.existsSync(storeFile) ? fs.readFileSync(storeFile, "utf8") : null;
  const files = fs.existsSync(uploadsDir) ? fs.readdirSync(uploadsDir, { recursive: true }).map(String).sort() : [];
  return { store, files };
}

async function post(procedure: string, json: unknown) {
  const r = await fetch(`${base}/api/trpc/${procedure}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ json }) });
  return { status: r.status, body: (await r.json()) as { result?: { data: { json: unknown } }; error?: { json: { message: string; data: { code: string; httpStatus: number } } } } };
}

beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "injetaflow-cv-"));
  storeFile = path.join(tmp, "injetaflow.json");
  uploadsDir = path.join(tmp, "uploads");
  process.env.INJETAFLOW_DATA_DIR = tmp;
  process.env.INJETAFLOW_PUBLIC_EMPRESA = EMPRESA;
  const repo = new JsonFileRepository(storeFile);
  // dado pré-existente (currículo de demonstração já gravado): não pode ser apagado nem alterado
  await repo.insert("solicitacoes", EMPRESA, { codigo: "SOL-0001", tipo: "Currículo", nome: "Demo", email: "demo@teste.local", status: "Novo" }, { actor: null });
  fs.mkdirSync(path.join(uploadsDir, EMPRESA), { recursive: true });
  fs.writeFileSync(path.join(uploadsDir, EMPRESA, "00000000-0000-0000-0000-000000000000.pdf"), "demo");
  const app = express();
  app.use(express.json({ limit: "8mb" }));
  app.use("/api/trpc", createExpressMiddleware({ router: appRouter, createContext: ({ req, res }) => ({ req, res, user: null, repo, sessionToken: null }) }));
  server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(() => {
  delete process.env.PORTAL_CURRICULOS_ATIVO;
  resetPublicRate();
});

afterAll(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
  delete process.env.INJETAFLOW_DATA_DIR;
  delete process.env.INJETAFLOW_PUBLIC_EMPRESA;
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("Spec Segurança: currículos do portal desativados (servidor)", () => {
  it("config pública expõe a flag e o padrão é false", async () => {
    const r = await fetch(`${base}/api/trpc/publico.config`);
    expect(r.status).toBe(200);
    expect(((await r.json()) as { result: { data: { json: unknown } } }).result.data.json).toEqual({ curriculosAtivo: false });
    process.env.PORTAL_CURRICULOS_ATIVO = "true";
    const on = await fetch(`${base}/api/trpc/publico.config`);
    expect(((await on.json()) as { result: { data: { json: unknown } } }).result.data.json).toEqual({ curriculosAtivo: true });
  });

  it("regressao R4/R5 curriculos portal desativado", async () => {
    for (const flag of [undefined, "false", "0", ""]) {
      if (flag === undefined) delete process.env.PORTAL_CURRICULOS_ATIVO;
      else process.env.PORTAL_CURRICULOS_ATIVO = flag;
      const antes = snapshot();
      const r = await post("publico.enviarSolicitacao", curriculo);
      expect(r.status, `flag=${String(flag)}`).toBe(403);
      expect(r.body.error?.json.message).toBe(CURRICULOS_DESATIVADOS_MSG);
      expect(r.body.error?.json.data.code).toBe("FORBIDDEN");
      const depois = snapshot();
      expect(depois.store, "store não muda").toBe(antes.store);
      expect(depois.files, "nenhum arquivo novo em uploads").toEqual(antes.files);
    }
    // o dado pré-existente continua lá (nada é apagado)
    expect(snapshot().store).toContain("SOL-0001");
    expect(snapshot().files).toContain(path.join(EMPRESA, "00000000-0000-0000-0000-000000000000.pdf"));
  });

  it("recusa ANTES da validação do corpo e do limite por IP (só o campo tipo é inspecionado)", async () => {
    const antes = snapshot();
    // corpo inválido (sem nome, e-mail ruim, anexo com extensão proibida): ainda assim 403, não 400
    const invalido = await post("publico.enviarSolicitacao", { tipo: "Currículo", email: "x", anexo: { nome: "virus.exe", base64: "AAAA" } });
    expect(invalido.status).toBe(403);
    // muitos envios seguidos: o limite por IP (429) nem é consultado, porque a recusa vem antes
    for (let i = 0; i < 12; i++) expect((await post("publico.enviarSolicitacao", curriculo)).status).toBe(403);
    expect(snapshot()).toEqual(antes);
  });

  it("controle: com a flag true (só em teste) o mesmo envio grava registro e arquivo; o teste detecta escrita", async () => {
    process.env.PORTAL_CURRICULOS_ATIVO = "true";
    const antes = snapshot();
    const r = await post("publico.enviarSolicitacao", curriculo);
    expect(r.status).toBe(200);
    const depois = snapshot();
    expect(depois.store).not.toBe(antes.store);
    expect(depois.files.length).toBe(antes.files.length + 1);
  });

  it("cotação e contato continuam ativos com a flag false", async () => {
    const cot = await post("publico.enviarSolicitacao", { tipo: "Cotação", nome: "Comprador", empresa: "Empresa X", email: "c@teste.local", necessidade: "Desenvolver uma peça nova", etapa: "Tenho uma amostra física", volume: "Ainda estou avaliando", material: "Preciso de orientação", consentimento: true });
    expect(cot.status).toBe(200);
    const con = await post("publico.enviarSolicitacao", { tipo: "Contato", nome: "Fulano", email: "f@teste.local", assunto: "Comercial", mensagem: "Mensagem de teste", consentimento: true });
    expect(con.status).toBe(200);
  });
});
