import { describe, expect, it } from "vitest";
import { login, setup } from "./helpers";

const base = { nome: "Nova Supervisora", email: "sup@teste.local", senha: "Senha-Sup-123", setor: "Produção" as const, perfil: "Supervisor" as const, matricula: "mat-0042", status: "Ativo" as const };

describe("usuários e acessos", () => {
  it("B11: usuário cadastrado aparece na lista, consegue logar e só acessa os módulos escolhidos", async () => {
    const { admin, repo } = await setup();
    const created = await admin.caller.usuarios.create({ ...base, permissoes: { producao: "editar", qualidade: "ver" } });
    expect(created).not.toHaveProperty("senhaHash");
    expect(created.matricula).toBe("MAT-0042");
    const list = await admin.caller.usuarios.list({ search: "supervisora" });
    expect(list.items.map(u => u.email)).toEqual(["sup@teste.local"]);
    const sup = await login(repo, "sup@teste.local", "Senha-Sup-123");
    expect((await sup.caller.records.list({ module: "producao" })).total).toBe(0);
    await expect(sup.caller.records.list({ module: "financeiro" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(sup.caller.records.create({ module: "qualidade", data: { tipo: "Inspeção", loteOrdem: "L", produto: "P", severidade: "Baixa", status: "Aberto", descricao: "d" } })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("e-mail e matrícula únicos, senha mínima", async () => {
    const { admin } = await setup();
    await admin.caller.usuarios.create({ ...base, permissoes: {} });
    await expect(admin.caller.usuarios.create({ ...base, matricula: "OUTRA", permissoes: {} })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(admin.caller.usuarios.create({ ...base, email: "outro@teste.local", permissoes: {} })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(admin.caller.usuarios.create({ ...base, email: "p@teste.local", matricula: "P", senha: "123", permissoes: {} })).rejects.toThrow();
  });

  it("editar permissões, redefinir senha, desativar e excluir", async () => {
    const { admin, repo } = await setup();
    const u = await admin.caller.usuarios.create({ ...base, permissoes: {} });
    await admin.caller.usuarios.update({ id: u.id, data: { permissoes: { financeiro: "ver" }, novaSenha: "Outra-Senha-1" } });
    const s = await login(repo, base.email, "Outra-Senha-1");
    expect((await s.caller.records.list({ module: "financeiro" })).total).toBe(0);
    await admin.caller.usuarios.update({ id: u.id, data: { status: "Inativo" } });
    expect((await admin.caller.usuarios.list({ status: "Inativo" })).total).toBe(1);
    await admin.caller.usuarios.remove({ id: u.id });
    expect((await admin.caller.usuarios.list({})).items.map(x => x.email)).not.toContain(base.email);
  });

  it("protege o último administrador e o próprio acesso", async () => {
    const { admin } = await setup();
    const me = (await admin.caller.auth.me())!;
    await expect(admin.caller.usuarios.remove({ id: me.id })).rejects.toThrow(/próprio/);
    await expect(admin.caller.usuarios.update({ id: me.id, data: { perfil: "Operador" } })).rejects.toThrow(/administrador ativo/);
  });

  it("exporta usuários em CSV sem hash de senha", async () => {
    const { admin } = await setup();
    const out = await admin.caller.usuarios.exportCsv({});
    expect(out.csv).toContain("Admin Teste");
    expect(out.csv).not.toContain("scrypt$");
  });
});
