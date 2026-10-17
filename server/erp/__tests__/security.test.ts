import { describe, expect, it } from "vitest";
import { ADMIN, callerFor, setup } from "./helpers";
import { trustProxySetting } from "../net";
import { createUser } from "../users";
import { generatePassword } from "../password";

const INATIVO_SENHA = generatePassword(12);

describe("N01: X-Forwarded-For forjado não burla bloqueio de login nem limite do portal", () => {
  it("bloqueio de login usa o IP do socket, mesmo trocando o X-Forwarded-For a cada tentativa", async () => {
    const { repo } = await setup();
    for (let i = 0; i < 5; i++) {
      const anon = await callerFor(repo, null, "10.0.0.7", { "x-forwarded-for": `10.9.9.${i}` });
      await expect(anon.caller.auth.login({ email: ADMIN.email, password: "errada-123" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    }
    const forged = await callerFor(repo, null, "10.0.0.7", { "x-forwarded-for": "10.9.9.99" });
    await expect(forged.caller.auth.login({ email: ADMIN.email, password: ADMIN.senha })).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });

  it("limite por e-mail independe do IP (força bruta distribuída)", async () => {
    const { repo } = await setup();
    for (let i = 0; i < 10; i++) {
      const anon = await callerFor(repo, null, `172.16.0.${i}`);
      await expect(anon.caller.auth.login({ email: ADMIN.email, password: "errada-123" })).rejects.toThrow();
    }
    const other = await callerFor(repo, null, "172.16.1.200");
    await expect(other.caller.auth.login({ email: ADMIN.email, password: ADMIN.senha })).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });

  it("limite do portal não reinicia com outro X-Forwarded-For", async () => {
    const { repo } = await setup();
    const base = { tipo: "Contato" as const, nome: "Fulano", email: "f@teste.local", assunto: "Teste", mensagem: "Mensagem de teste", consentimento: true as const };
    for (let i = 0; i < 8; i++) {
      const anon = await callerFor(repo, null, "10.0.0.8", { "x-forwarded-for": `1.1.1.${i}` });
      await anon.caller.publico.enviarSolicitacao(base);
    }
    const forged = await callerFor(repo, null, "10.0.0.8", { "x-forwarded-for": "8.8.8.8" });
    await expect(forged.caller.publico.enviarSolicitacao(base)).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });

  it("com trust proxy explícito, o IP do proxy confiável é respeitado", async () => {
    expect(trustProxySetting({})).toBeNull();
    expect(trustProxySetting({ INJETAFLOW_TRUST_PROXY: "1" })).toBe(1);
    expect(trustProxySetting({ INJETAFLOW_TRUST_PROXY: "loopback" })).toBe("loopback");
    const { repo } = await setup();
    for (let i = 0; i < 5; i++) {
      const anon = await callerFor(repo, null, "127.0.0.1", { "x-forwarded-for": "203.0.113.5" }, true);
      await expect(anon.caller.auth.login({ email: ADMIN.email, password: "errada-123" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    }
    const otherClient = await callerFor(repo, null, "127.0.0.1", { "x-forwarded-for": "203.0.113.6" }, true);
    await otherClient.caller.auth.login({ email: ADMIN.email, password: ADMIN.senha });
  });
});

describe("N12: usuário inativo recebe mensagem clara (só quando a senha está certa)", () => {
  it("inativo com senha certa → FORBIDDEN 'Usuário inativo'; senha errada continua genérica", async () => {
    const { repo, empresaId } = await setup();
    await createUser(repo, null, empresaId, { nome: "Inativo Teste", email: "inativo@teste.local", senha: INATIVO_SENHA, setor: "Produção", perfil: "Operador", matricula: "INA-1", permissoes: {}, status: "Inativo" });
    const anon = await callerFor(repo);
    await expect(anon.caller.auth.login({ email: "inativo@teste.local", password: INATIVO_SENHA })).rejects.toMatchObject({ code: "FORBIDDEN", message: expect.stringMatching(/Usuário inativo/) });
    await expect(anon.caller.auth.login({ email: "inativo@teste.local", password: "errada-123" })).rejects.toMatchObject({ code: "UNAUTHORIZED", message: "Usuário, e-mail, matrícula ou senha inválidos." });
  });
});
