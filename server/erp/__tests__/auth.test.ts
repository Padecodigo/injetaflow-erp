import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { ADMIN, callerFor, createAndLogin, login, setup } from "./helpers";
import { SESSION_COOKIE } from "../auth";

describe("sessão com e-mail e senha", () => {
  it("B02: login grava cookie httpOnly e a sessão continua válida em nova requisição (F5)", async () => {
    const { repo, admin } = await setup();
    const cookie = admin.loginJar.set[SESSION_COOKIE];
    expect(cookie.options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
    // nova requisição só com o cookie (simula F5 ou URL direta)
    const again = await callerFor(repo, admin.token);
    const me = await again.caller.auth.me();
    expect(me?.email).toBe(ADMIN.email);
    expect(me).not.toHaveProperty("senhaHash");
  });

  it("recusa senha errada e e-mail inexistente com a mesma mensagem", async () => {
    const { repo } = await setup();
    const anon = await callerFor(repo);
    await expect(anon.caller.auth.login({ email: ADMIN.email, password: "errada" })).rejects.toThrow("E-mail ou senha inválidos.");
    await expect(anon.caller.auth.login({ email: "x@y.z", password: "errada" })).rejects.toThrow("E-mail ou senha inválidos.");
  });

  it("bloqueia após 5 tentativas erradas", async () => {
    const { repo } = await setup();
    const anon = await callerFor(repo, null, "9.9.9.9");
    for (let i = 0; i < 5; i++) await anon.caller.auth.login({ email: ADMIN.email, password: "errada" }).catch(() => undefined);
    await expect(anon.caller.auth.login({ email: ADMIN.email, password: ADMIN.senha })).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });

  it("B03: logout apaga a sessão no servidor e limpa o cookie", async () => {
    const { repo, admin } = await setup();
    await admin.caller.auth.logout();
    expect(admin.jar.cleared[0]?.name).toBe(SESSION_COOKIE);
    const after = await callerFor(repo, admin.token);
    expect(await after.caller.auth.me()).toBeNull();
  });

  it("guarda no servidor: rotas privadas exigem sessão", async () => {
    const { repo } = await setup();
    const anon = await callerFor(repo);
    await expect(anon.caller.records.list({ module: "ordens" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(anon.caller.dashboard.summary()).rejects.toBeInstanceOf(TRPCError);
    await expect(anon.caller.usuarios.list({})).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(anon.caller.rh.presenca()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(anon.caller.perfil.resumo()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("usuário inativo não entra e perde a sessão", async () => {
    const { repo, admin } = await setup("empresa-a");
    const op = await createAndLogin(repo, "empresa-a", { email: "op@teste.local", permissoes: { producao: "editar" } });
    const me = await op.caller.auth.me();
    await admin.caller.usuarios.update({ id: me!.id, data: { status: "Inativo" } });
    expect(await (await callerFor(repo, op.token)).caller.auth.me()).toBeNull();
    await expect(login(repo, "op@teste.local", "Senha-Usuario-123")).rejects.toThrow();
  });

  it("troca de senha exige a senha atual", async () => {
    const { repo, admin } = await setup();
    await expect(admin.caller.auth.changePassword({ atual: "errada", nova: "Nova-Senha-456" })).rejects.toThrow("Senha atual incorreta.");
    await admin.caller.auth.changePassword({ atual: ADMIN.senha, nova: "Nova-Senha-456" });
    await expect(login(repo, ADMIN.email, ADMIN.senha)).rejects.toThrow();
    const ok = await login(repo, ADMIN.email, "Nova-Senha-456");
    expect((await ok.caller.auth.me())?.email).toBe(ADMIN.email);
  });
});
