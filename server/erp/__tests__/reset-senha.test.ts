import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { JsonFileRepository } from "../repository";
import { USERS } from "../auth";
import { generatePassword, hashPassword, verifyPassword } from "../password";
import type { UserData } from "../types";
import { parseArgs } from "../../../tools/reset-admin-password";

const root = path.resolve(__dirname, "../../..");
const tsx = path.join(root, "node_modules", ".bin", "tsx");

const dirs: string[] = [];
afterAll(() => { for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true }); });

function storeAntigo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "injetaflow-reset-"));
  dirs.push(dir);
  const repo = new JsonFileRepository(path.join(dir, "injetaflow.json"));
  return { dir, repo };
}

function run(dir: string, args: string[], env: Record<string, string> = {}) {
  const childEnv: NodeJS.ProcessEnv = { ...process.env, INJETAFLOW_DATA_DIR: dir, NODE_ENV: "development", ...env };
  delete childEnv.VITEST;
  delete childEnv.INJETAFLOW_ADMIN_PASSWORD;
  delete childEnv.INJETAFLOW_ADMIN_USERNAME;
  Object.assign(childEnv, env);
  return execFileSync(tsx, ["tools/reset-admin-password.ts", ...args], { cwd: root, env: childEnv, encoding: "utf8" });
}

const ler = (dir: string) => new JsonFileRepository(path.join(dir, "injetaflow.json"));

describe("pnpm erp:reset-senha (identificador flexível + username)", () => {
  it("lê argumentos", () => {
    expect(parseArgs(["ADM-0001", "--username", "admin"])).toEqual({ identificador: "ADM-0001", username: "admin", manterSenha: false });
    expect(parseArgs(["--username=chefe", "--manter-senha"])).toEqual({ identificador: undefined, username: "chefe", manterSenha: true });
    expect(() => parseArgs(["--xyz"])).toThrow(/desconhecido/);
  });

  it("por matrícula, define username via INJETAFLOW_ADMIN_USERNAME e senha de variável SEM imprimi-la; migra o store antigo", async () => {
    const { dir, repo } = storeAntigo();
    const antigo = await repo.insert<UserData>(USERS, "wamovale", { nome: "Administrador Wamovale", email: "chefe@wamovale.local", senhaHash: hashPassword(generatePassword(12)), setor: "Administrativo", perfil: "Administrador", matricula: "ADM-0001", permissoes: {}, status: "Inativo", ultimoAcesso: null });
    const senha = generatePassword(6);
    const out = run(dir, ["adm-0001"], { INJETAFLOW_ADMIN_PASSWORD: senha, INJETAFLOW_ADMIN_USERNAME: "admin" });
    expect(out).not.toContain(senha);
    expect(out).toMatch(/não exibida/);
    expect(out).toMatch(/usuário "admin"/);
    const user = (await ler(dir).get<UserData>(USERS, "wamovale", antigo.id))!;
    expect(user.data.username).toBe("admin");
    expect(user.data.status).toBe("Ativo");
    expect(verifyPassword(senha, user.data.senhaHash)).toBe(true);
    expect(fs.readFileSync(path.join(dir, "injetaflow.json"), "utf8")).not.toContain(senha);
  }, 30000);

  it("por username e por e-mail; --username como argumento; senha gerada aparece só no console", async () => {
    const { dir, repo } = storeAntigo();
    const u = await repo.insert<UserData>(USERS, "wamovale", { nome: "Operador", email: "op@wamovale.local", username: "op", senhaHash: hashPassword(generatePassword(12)), setor: "Produção", perfil: "Operador", matricula: "OP-1", permissoes: {}, status: "Ativo", ultimoAcesso: null });
    const out = run(dir, ["OP", "--username", "operador.novo"]);
    const gerada = out.match(/mostrada só agora\): (\S+)/)?.[1];
    expect(gerada).toBeTruthy();
    let user = (await ler(dir).get<UserData>(USERS, "wamovale", u.id))!;
    expect(user.data.username).toBe("operador.novo");
    expect(verifyPassword(gerada!, user.data.senhaHash)).toBe(true);
    const senha = generatePassword(8);
    run(dir, ["op@wamovale.local"], { INJETAFLOW_ADMIN_PASSWORD: senha });
    user = (await ler(dir).get<UserData>(USERS, "wamovale", u.id))!;
    expect(verifyPassword(senha, user.data.senhaHash)).toBe(true);
  }, 30000);

  it("recusa senha de variável com menos de 6 caracteres e username inválido", () => {
    const { dir } = storeAntigo();
    expect(() => run(dir, [], { INJETAFLOW_ADMIN_PASSWORD: generatePassword(5) })).toThrow();
    expect(() => run(dir, ["--username", "nome com espaço"])).toThrow();
  }, 30000);
});
