import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { campoSensivel, linhasDeLogMascaradas, MASCARA, mascararSensiveis, mascararTexto } from "../../_core/redact";

/**
 * Auditoria de frontend (item de backend): em modo dev, o coletor de logs de depuração gravava em
 * .manus-logs/ o corpo das requisições com campos chamados "senha" (login, troca de senha, Usuários).
 */
describe("logger de depuração do modo dev mascara senha, password, token e similares", () => {
  it("unitário: campos sensíveis em português e inglês, em qualquer profundidade", () => {
    for (const nome of ["senha", "senhaAtual", "novaSenha", "confirmarSenha", "password", "newPassword", "token", "accessToken", "authorization", "Cookie", "apiKey", "api_key", "secret", "sessão", "credencial", "passwordHash"]) {
      expect(campoSensivel(nome), nome).toBe(true);
    }
    for (const nome of ["nome", "email", "matricula", "perfil", "setor", "codigo"]) expect(campoSensivel(nome), nome).toBe(false);
    const entrada = {
      url: "/api/trpc/usuarios.update?batch=1",
      request: { body: { "0": { json: { id: "u1", nome: "Ana", senha: "Nova#Senha1", senhaAtual: "Velha#1", extra: [{ token: "abc" }] } } } },
    };
    const saida = JSON.stringify(mascararSensiveis(entrada));
    expect(saida).not.toContain("Nova#Senha1");
    expect(saida).not.toContain("Velha#1");
    expect(saida).not.toContain('"abc"');
    expect(saida).toContain('"nome":"Ana"');
    expect(saida).toContain(MASCARA);
  });

  it("unitário: textos com JSON, query string e Authorization também são mascarados", () => {
    const texto = mascararTexto('corpo {"identifier":"admin","password":"P@ss 1"} url ?senha=123&x=1 Authorization: Bearer eyJabc.def');
    expect(texto).not.toMatch(/P@ss 1|senha=123|eyJabc/);
    expect(texto).toContain('"identifier":"admin"');
    expect(texto).toContain("x=1");
  });

  it("unitário: linhas do arquivo de log saem mascaradas e com data", () => {
    const [linha] = linhasDeLogMascaradas([{ consoleArgs: [{ senha: "segredo-123" }] }], () => new Date("2026-10-17T12:00:00Z"));
    expect(linha.startsWith("[2026-10-17T12:00:00.000Z] ")).toBe(true);
    expect(linha).not.toContain("segredo-123");
  });

  const logDir = fs.mkdtempSync(path.join(os.tmpdir(), "injetaflow-debuglog-"));
  afterAll(() => fs.rmSync(logDir, { recursive: true, force: true }));

  it("integração: o coletor do Vite (POST /__manus__/logs) grava o arquivo sem a senha", async () => {
    process.env.INJETAFLOW_DEBUG_LOG_DIR = logDir;
    const { default: config } = await import("../../../vite.config");
    const plugins = (config as { plugins: Array<{ name?: string; configureServer?: (s: unknown) => void }> }).plugins;
    const coletor = plugins.find(p => p?.name === "manus-debug-collector");
    expect(coletor?.configureServer).toBeTypeOf("function");
    let handler: ((req: unknown, res: unknown, next: () => void) => void) | undefined;
    coletor!.configureServer!({ middlewares: { use: (rota: string, fn: typeof handler) => { if (rota === "/__manus__/logs") handler = fn; } } });
    let status = 0;
    handler!(
      {
        method: "POST",
        body: {
          networkRequests: [{ url: "/api/trpc/auth.login?batch=1", request: { body: { "0": { json: { identifier: "admin", password: "Senha-Do-Admin-9" } } } } }],
          consoleLogs: [{ args: ["troca", { senhaAtual: "Velha-1", senha: "Nova-2" }] }],
        },
      },
      { writeHead: (s: number) => { status = s; }, end: () => undefined },
      () => undefined
    );
    expect(status).toBe(200);
    const network = fs.readFileSync(path.join(logDir, "networkRequests.log"), "utf8");
    const consoleLog = fs.readFileSync(path.join(logDir, "browserConsole.log"), "utf8");
    expect(network).toContain('"identifier":"admin"');
    expect(network).not.toContain("Senha-Do-Admin-9");
    expect(consoleLog).not.toMatch(/Velha-1|Nova-2/);
    expect(consoleLog).toContain(MASCARA);
  });

  it("o coletor do navegador também trata 'senha' como campo sensível (nomes em português)", () => {
    const js = fs.readFileSync(path.resolve(__dirname, "../../../client/public/__manus__/debug-collector.js"), "utf8");
    const lista = /sensitiveFields:\s*\[([^\]]*)\]/.exec(js)?.[1] ?? "";
    for (const campo of ["senha", "password", "token", "secret"]) expect(lista).toContain(`"${campo}"`);
  });
});
