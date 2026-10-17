import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MemoryRepository } from "../repository";
import { ensureSeed } from "../seed";
import { login } from "./helpers";

describe("seed do administrador inicial", () => {
  it("usa a senha de INJETAFLOW_ADMIN_PASSWORD sem imprimi-la", async () => {
    const repo = new MemoryRepository();
    const logs: string[] = [];
    const result = await ensureSeed(repo, { empresaId: "e1", log: m => logs.push(m), env: { INJETAFLOW_ADMIN_EMAIL: "chefe@teste.local", INJETAFLOW_ADMIN_PASSWORD: "Senha-Do-Env-1", INJETAFLOW_SEED_DEMO: "false" } });
    expect(result).toMatchObject({ adminCreated: true, adminEmail: "chefe@teste.local", demoSeeded: false });
    expect(result.generatedPassword).toBeUndefined();
    expect(logs.join("\n")).not.toContain("Senha-Do-Env-1");
    const s = await login(repo, "chefe@teste.local", "Senha-Do-Env-1");
    expect((await s.caller.auth.me())?.perfil).toBe("Administrador");
  });

  it("gera senha aleatória e mostra só no console local quando não há variável", async () => {
    const repo = new MemoryRepository();
    const logs: string[] = [];
    const result = await ensureSeed(repo, { empresaId: "e1", log: m => logs.push(m), env: { INJETAFLOW_SEED_DEMO: "false" } });
    expect(result.generatedPassword).toHaveLength(16);
    expect(logs.join("\n")).toContain(result.generatedPassword!);
    await login(repo, "admin@wamovale.local", result.generatedPassword!);
    // segunda execução não recria nem imprime de novo
    const again = await ensureSeed(repo, { empresaId: "e1", log: m => logs.push(m), env: { INJETAFLOW_SEED_DEMO: "false" } });
    expect(again.adminCreated).toBe(false);
  });

  it("dados de exemplo ficam marcados como demonstração", async () => {
    const repo = new MemoryRepository();
    await ensureSeed(repo, { empresaId: "e1", log: () => undefined, env: { INJETAFLOW_ADMIN_PASSWORD: "Senha-Do-Env-1" } });
    for (const collection of ["ordens", "moldes", "estoque", "colaboradores", "financeiro", "producao", "movimentacoes"]) {
      const { items } = await repo.list(collection, "e1");
      expect(items.length, collection).toBeGreaterThan(0);
      expect(items.every(item => item.demo === true), collection).toBe(true);
    }
  });

  it("B12: nenhuma senha demo hardcoded no front-end", () => {
    const root = path.resolve(process.cwd(), "client/src");
    const files: string[] = [];
    const walk = (dir: string) => fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(tsx?|css)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) files.push(full);
    });
    walk(root);
    const offenders = files.filter(file => /adm123|demo123|authenticateDemoUser|DEMO_USERS/.test(fs.readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
    expect(fs.existsSync(path.join(root, "lib/demo-auth.ts"))).toBe(false);
  });
});

describe("seed de usuários de demonstração (pnpm dev sem variáveis)", () => {
  it("cria um usuário demo por perfil com senha gerada mostrada só no console", async () => {
    const repo = new MemoryRepository();
    const logs: string[] = [];
    const result = await ensureSeed(repo, { empresaId: "e1", log: m => logs.push(m), env: {} });
    expect(result.demoUsers).toHaveLength(4);
    expect(result.generatedDemoPassword).toHaveLength(16);
    expect(logs.join("\n")).toContain(result.generatedDemoPassword!);
    const operador = await login(repo, "operador.demo@wamovale.local", result.generatedDemoPassword!);
    const me = await operador.caller.auth.me();
    expect(me?.perfil).toBe("Operador");
    await expect(operador.caller.usuarios.list({})).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("usa INJETAFLOW_DEMO_PASSWORD sem imprimi-la", async () => {
    const repo = new MemoryRepository();
    const logs: string[] = [];
    await ensureSeed(repo, { empresaId: "e1", log: m => logs.push(m), env: { INJETAFLOW_ADMIN_PASSWORD: "Senha-Admin-Env-1", INJETAFLOW_DEMO_PASSWORD: "Senha-Demo-Env-1" } });
    expect(logs.join("\n")).not.toContain("Senha-Demo-Env-1");
    await login(repo, "consulta.demo@wamovale.local", "Senha-Demo-Env-1");
  });
});
