// Auditoria back-end, B-02 (média): pela rota de Usuários, quem tinha "Usuários: editar" (e o admin) trocava a PRÓPRIA
// senha, e-mail ou nome de usuário sem a senha atual. Agora essas três exigem `senhaAtual` (como em Meu perfil).
import { describe, expect, it } from "vitest";
import { PERFIL_PRESETS } from "@shared/erp/modules";
import { SESSION_COOKIE } from "../auth";
import { ADMIN, callerFor, createAndLogin, login, setup, USER_SENHA } from "./helpers";

describe("B-02: credenciais próprias só com a senha atual", () => {
  it("não troca a própria senha por usuarios.update sem a senha atual", async () => {
    const { repo, empresaId } = await setup();
    const gu = await createAndLogin(repo, empresaId, { email: "gu@t.local", perfil: "Gestor", permissoes: { ...PERFIL_PRESETS.Gestor, usuarios: "editar" }, matricula: "GU-1" });
    const me = (await gu.caller.auth.me())!;
    await expect(gu.caller.usuarios.update({ id: me.id, data: { novaSenha: "nova-senha-sem-atual" } })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(gu.caller.usuarios.update({ id: me.id, data: { novaSenha: "nova-senha-sem-atual", senhaAtual: "errada-123" } })).rejects.toThrow(/Senha atual incorreta/);
    // a senha antiga continua valendo
    await expect(login(repo, "gu@t.local", USER_SENHA)).resolves.toBeTruthy();
  });

  it("administrador também não troca a própria senha, e-mail ou nome de usuário sem a senha atual", async () => {
    const { admin } = await setup();
    const me = (await admin.caller.auth.me())!;
    await expect(admin.caller.usuarios.update({ id: me.id, data: { novaSenha: "nova-senha-sem-atual" } })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(admin.caller.usuarios.update({ id: me.id, data: { email: "outro@t.local" } })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(admin.caller.usuarios.update({ id: me.id, data: { username: "outro.nome" } })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("com a senha atual certa, troca e mantém a sessão atual (as outras caem)", async () => {
    const { repo, admin } = await setup();
    const outraSessao = await login(repo, ADMIN.email, ADMIN.senha);
    const me = (await admin.caller.auth.me())!;
    const nova = "nova-senha-com-atual-1";
    await expect(admin.caller.usuarios.update({ id: me.id, data: { novaSenha: nova, email: "admin2@teste.local", senhaAtual: ADMIN.senha } })).resolves.toMatchObject({ email: "admin2@teste.local" });
    expect(await (await callerFor(repo, admin.token)).caller.auth.me()).toMatchObject({ id: me.id });
    expect(await (await callerFor(repo, outraSessao.token)).caller.auth.me()).toBeNull();
    const anon = await callerFor(repo);
    await anon.caller.auth.login({ email: "admin2@teste.local", password: nova });
    expect(anon.jar.set[SESSION_COOKIE]).toBeTruthy();
  });

  it("o formulário completo com e-mail e usuário iguais (sem troca de credencial) não pede a senha atual", async () => {
    const { admin } = await setup();
    const me = (await admin.caller.auth.me())!;
    await expect(admin.caller.usuarios.update({ id: me.id, data: { nome: "Admin Renomeado", email: me.email, username: me.username, matricula: me.matricula } })).resolves.toMatchObject({ nome: "Admin Renomeado" });
  });
});
