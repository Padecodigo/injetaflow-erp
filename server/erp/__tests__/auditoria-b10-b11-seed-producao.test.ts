import fs from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { MemoryRepository } from "../repository";
import { ARQUIVO_SENHA_INICIAL, deveSemearDemo, ensureSeed } from "../seed";
import { generatePassword } from "../password";
import { esperarSaida, pastaTemporaria, subirServidor } from "./helpers-servidor-dados";

/**
 * B-10 (média): em produção o seed criava dados e USUÁRIOS de demonstração (gestora.demo com quase todos
 * os módulos) se ninguém lembrasse de INJETAFLOW_SEED_DEMO=false.
 * B-11 (média): a senha gerada do admin e a dos demo iam para o stdout (docker logs/journald).
 */
const dirs: string[] = [];
afterAll(() => { for (const d of dirs) fs.rmSync(d, { recursive: true, force: true }); });
const demos = async (repo: MemoryRepository) => (await repo.list<{ email: string }>("usuarios", "e1", {})).items.map(u => u.data.email).filter(e => e.includes(".demo@"));

describe("B-10: produção não semeia demonstração por padrão", () => {
  it("unitário: regra da variável", () => {
    expect(deveSemearDemo({ NODE_ENV: "production" })).toBe(false);
    expect(deveSemearDemo({})).toBe(false); // NODE_ENV ausente: o servidor roda como produção
    expect(deveSemearDemo({ NODE_ENV: "development" })).toBe(true);
    expect(deveSemearDemo({ NODE_ENV: "production", INJETAFLOW_SEED_DEMO: "1" })).toBe(true);
    expect(deveSemearDemo({ NODE_ENV: "production", INJETAFLOW_SEED_DEMO: "true" })).toBe(true);
    expect(deveSemearDemo({ NODE_ENV: "development", INJETAFLOW_SEED_DEMO: "false" })).toBe(false);
  });

  it("NODE_ENV=production sem INJETAFLOW_SEED_DEMO → nenhum usuário nem dado de demonstração", async () => {
    const repo = new MemoryRepository();
    const r = await ensureSeed(repo, { empresaId: "e1", log: () => undefined, env: { NODE_ENV: "production", INJETAFLOW_ADMIN_PASSWORD: generatePassword(14) } });
    expect(r.demoSeeded).toBe(false);
    expect(await demos(repo)).toEqual([]);
    expect((await repo.list("ordens", "e1")).total).toBe(0);
  });

  it("produção com INJETAFLOW_SEED_DEMO=1 (explícito) ainda pode semear", async () => {
    const repo = new MemoryRepository();
    await ensureSeed(repo, { empresaId: "e1", log: () => undefined, env: { NODE_ENV: "production", INJETAFLOW_SEED_DEMO: "1", INJETAFLOW_ADMIN_PASSWORD: generatePassword(14), INJETAFLOW_DEMO_PASSWORD: generatePassword(14) } });
    expect(await demos(repo)).toHaveLength(4);
  });
});

describe("B-11: senha gerada não vai para o log", () => {
  it("sem arquivo configurado: o log não tem a senha e diz como definir/redefinir", async () => {
    const repo = new MemoryRepository();
    const logs: string[] = [];
    const r = await ensureSeed(repo, { empresaId: "e1", log: m => logs.push(m), env: { NODE_ENV: "production", INJETAFLOW_SEED_DEMO: "false" } });
    expect(r.generatedPassword).toBeTruthy();
    expect(logs.join("\n").includes(r.generatedPassword!), "a senha gerada aparece no log").toBe(false);
    expect(logs.join("\n")).toMatch(/não exibida.*erp:reset-senha/);
  });

  it("com arquivo: senha do admin e dos demo vão para o arquivo 0600; o log mostra só o caminho", async () => {
    const dir = pastaTemporaria("b11-");
    dirs.push(dir);
    const arquivoSenha = path.join(dir, ARQUIVO_SENHA_INICIAL);
    const repo = new MemoryRepository();
    const logs: string[] = [];
    const r = await ensureSeed(repo, { empresaId: "e1", log: m => logs.push(m), env: { NODE_ENV: "development" }, arquivoSenha });
    const log = logs.join("\n");
    expect(log.includes(r.generatedPassword!)).toBe(false);
    expect(log.includes(r.generatedDemoPassword!)).toBe(false);
    expect(log).toContain(arquivoSenha);
    expect(fs.statSync(arquivoSenha).mode & 0o777).toBe(0o600);
    const conteudo = fs.readFileSync(arquivoSenha, "utf8");
    expect(conteudo).toContain(r.generatedPassword!);
    expect(conteudo).toContain(r.generatedDemoPassword!);
  });

  it("integração: o servidor real em produção grava <pasta>/senha-inicial.txt (0600), não semeia demo e não imprime a senha", async () => {
    const dir = pastaTemporaria("b11-srv-");
    dirs.push(dir);
    const srv = await subirServidor(dir, { INJETAFLOW_SEED_DEMO: "" });
    try {
      const arquivo = path.join(dir, ARQUIVO_SENHA_INICIAL);
      expect(fs.statSync(arquivo).mode & 0o777).toBe(0o600);
      const senha = /^Senha: (\S+)$/m.exec(fs.readFileSync(arquivo, "utf8"))?.[1];
      expect(senha).toBeTruthy();
      expect(srv.log().includes(senha!)).toBe(false);
      expect(srv.log()).toContain(arquivo);
      expect(srv.log()).not.toMatch(/DEMONSTRAÇÃO/);
      const login = await fetch(`http://127.0.0.1:${srv.porta}/api/trpc/auth.login?batch=1`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ 0: { json: { email: "admin", password: senha } } }) });
      expect(login.status).toBe(200);
    } finally {
      await srv.parar();
      await esperarSaida(srv, 5000);
    }
  }, 60_000);
});
