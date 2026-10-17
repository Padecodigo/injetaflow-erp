import { describe, expect, it } from "vitest";
import { MemoryRepository } from "../repository";
import { USERS, hashUserPassword } from "../auth";
import { generatePassword } from "../password";
import { createUser, deleteUser, migrateUsernames, restoreUser } from "../users";
import { AUTOR_CLI, AUTOR_INICIALIZACAO, AUTOR_MIGRACAO, type AuditEntry } from "../audit";
import { DEFAULT_EMPRESA_ID } from "../store";
import { ensureSeed } from "../seed";
import type { SessionUser, UserData } from "../types";
import { createAndLogin, setup } from "./helpers";

const senha = () => generatePassword(10);
const base = (email: string, matricula: string) => ({ nome: `Pessoa ${matricula}`, email, senha: senha(), setor: "Produção" as const, matricula, status: "Ativo" as const });

/** Gestora com "Usuários: editar" + alguns módulos (cenário do aceite P6-01). */
async function cenario() {
  const ctx = await setup();
  const gestora = await createAndLogin(ctx.repo, ctx.empresaId, { email: "gestora@teste.local", perfil: "Gestor", matricula: "GES-1", permissoes: { usuarios: "editar", producao: "editar", qualidade: "ver" } });
  const gestoraMe = (await gestora.caller.auth.me())!;
  const adminMe = (await ctx.admin.caller.auth.me())!;
  return { ...ctx, gestora, gestoraMe, adminMe };
}

describe("P6-01: não administrador com 'Usuários: editar' não escala privilégio", () => {
  it("não cria Administrador", async () => {
    const { gestora } = await cenario();
    await expect(gestora.caller.usuarios.create({ ...base("novo.admin@teste.local", "NA-1"), perfil: "Administrador", permissoes: {} })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(gestora.caller.usuarios.list({})).resolves.toMatchObject({ total: 2 });
  });

  it("só concede módulos que ele próprio possui (no mesmo nível)", async () => {
    const { gestora } = await cenario();
    await expect(gestora.caller.usuarios.create({ ...base("a@teste.local", "A-1"), perfil: "Operador", permissoes: { configuracoes: "editar" } })).rejects.toThrow(/Configurações/);
    await expect(gestora.caller.usuarios.create({ ...base("b@teste.local", "B-1"), perfil: "Operador", permissoes: { qualidade: "editar" } })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(gestora.caller.usuarios.create({ ...base("c@teste.local", "C-1"), perfil: "Operador", permissoes: { producao: "editar", qualidade: "ver" } })).resolves.toMatchObject({ permissoes: { producao: "editar", qualidade: "ver" } });
  });

  it("não exclui nem desativa administrador, nem edita o admin", async () => {
    const { gestora, adminMe } = await cenario();
    await expect(gestora.caller.usuarios.remove({ id: adminMe.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(gestora.caller.usuarios.update({ id: adminMe.id, data: { status: "Inativo" } })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(gestora.caller.usuarios.update({ id: adminMe.id, data: { novaSenha: senha() } })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("não altera as próprias permissões, perfil ou status (mas pode corrigir o próprio nome)", async () => {
    const { gestora, gestoraMe } = await cenario();
    await expect(gestora.caller.usuarios.update({ id: gestoraMe.id, data: { permissoes: { ...gestoraMe.permissoes, configuracoes: "editar", financeiro: "editar" } } })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(gestora.caller.usuarios.update({ id: gestoraMe.id, data: { perfil: "Supervisor" } })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(gestora.caller.usuarios.update({ id: gestoraMe.id, data: { status: "Inativo" } })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await gestora.caller.auth.me())!.permissoes).toEqual(gestoraMe.permissoes);
    await expect(gestora.caller.usuarios.update({ id: gestoraMe.id, data: { nome: "Gestora Renomeada", perfil: "Gestor", permissoes: gestoraMe.permissoes } })).resolves.toMatchObject({ nome: "Gestora Renomeada" });
  });

  it("ao editar outra pessoa, não concede módulos que não possui, mas mantém os que ela já tinha", async () => {
    const { repo, empresaId, gestora } = await cenario();
    const alvo = await createUser(repo, null, empresaId, { ...base("alvo@teste.local", "ALV-1"), perfil: "Supervisor", permissoes: { financeiro: "editar" } });
    await expect(gestora.caller.usuarios.update({ id: alvo.id, data: { permissoes: { financeiro: "editar", configuracoes: "ver" } } })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(gestora.caller.usuarios.update({ id: alvo.id, data: { setor: "Qualidade", permissoes: { financeiro: "editar", producao: "ver" } } })).resolves.toMatchObject({ setor: "Qualidade", permissoes: { financeiro: "editar", producao: "ver" } });
  });

  it("administrador: não se rebaixa, não se desativa, não se exclui; o último admin ativo nunca sai", async () => {
    const { repo, empresaId, admin, adminMe } = await cenario();
    const outro = await createUser(repo, null, empresaId, { ...base("admin2@teste.local", "ADM-0002"), setor: "Administrativo", perfil: "Administrador", permissoes: {} });
    await expect(admin.caller.usuarios.update({ id: adminMe.id, data: { perfil: "Gestor" } })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(admin.caller.usuarios.update({ id: adminMe.id, data: { status: "Inativo" } })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(admin.caller.usuarios.update({ id: adminMe.id, data: { permissoes: { rh: "ver" } } })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(admin.caller.usuarios.remove({ id: adminMe.id })).rejects.toThrow(/próprio usuário/);
    // admin pode cuidar de OUTRO administrador
    await expect(admin.caller.usuarios.update({ id: outro.id, data: { status: "Inativo" } })).resolves.toMatchObject({ status: "Inativo" });
    // proteção do último administrador ativo, mesmo vinda de outro caminho
    const fantasma = { ...adminMe, id: "outro-admin-fora-da-base" } as SessionUser;
    await expect(deleteUser(repo, fantasma, adminMe.id)).rejects.toThrow(/pelo menos um administrador ativo/);
  });

  it("edição parcial não zera módulos nem status (ex.: só desativar/reativar)", async () => {
    const { repo, empresaId, admin } = await cenario();
    const op = await createUser(repo, null, empresaId, { ...base("op@teste.local", "OP-1"), perfil: "Operador", permissoes: { producao: "editar", estoque: "ver" } });
    await admin.caller.usuarios.update({ id: op.id, data: { status: "Inativo" } });
    const out = await admin.caller.usuarios.update({ id: op.id, data: { status: "Ativo" } });
    expect(out.permissoes).toEqual({ producao: "editar", estoque: "ver" });
    const so = await admin.caller.usuarios.update({ id: op.id, data: { setor: "Qualidade" } });
    expect(so).toMatchObject({ status: "Ativo", permissoes: { producao: "editar", estoque: "ver" } });
  });

  it("auditoria diz quais módulos mudaram", async () => {
    const { repo, empresaId, admin } = await cenario();
    const op = await createUser(repo, null, empresaId, { ...base("op2@teste.local", "OP-2"), perfil: "Operador", permissoes: { producao: "editar" } });
    await admin.caller.usuarios.update({ id: op.id, data: { permissoes: { producao: "ver", financeiro: "ver" } } });
    const { items } = await repo.list<AuditEntry>("auditoria", empresaId, { filter: d => d.registroId === op.id && d.acao === "editar" });
    expect(items[0].data.resumo).toMatch(/módulos: Produção.*: editar → ver, \+Financeiro \(ver\)/);
  });
});

describe("P6-02: autor correto na auditoria de ações sem sessão", () => {
  it("migração = 'Sistema (migração)'; 1º start = 'Sistema (inicialização)'", async () => {
    const repo = new MemoryRepository();
    await repo.insert<UserData>(USERS, "wamovale", { nome: "Admin", email: "adm@x.local", senhaHash: hashUserPassword(senha()), setor: "Administrativo", perfil: "Administrador", matricula: "ADM-1", permissoes: {}, status: "Ativo", ultimoAcesso: null });
    await migrateUsernames(repo);
    const { items } = await repo.list<AuditEntry>("auditoria", "wamovale");
    expect(items[0].data.usuario).toBe(AUTOR_MIGRACAO);
    expect(items[0].createdBy?.nome).toBe(AUTOR_MIGRACAO);
    const user = (await repo.list<UserData>(USERS, "wamovale")).items[0];
    expect(user.updatedBy?.nome).toBe(AUTOR_MIGRACAO);

    const novo = new MemoryRepository();
    await ensureSeed(novo, { log: () => undefined, env: { INJETAFLOW_SEED_DEMO: "false", INJETAFLOW_ADMIN_PASSWORD: senha() } });
    const audit = await novo.list<AuditEntry>("auditoria", DEFAULT_EMPRESA_ID);
    expect(audit.items.length).toBeGreaterThan(0);
    expect(audit.items.every(i => i.data.usuario === AUTOR_INICIALIZACAO)).toBe(true);
    expect(JSON.stringify(audit.items)).not.toContain("Portal público");
  });
});

describe("P6-03: mensagens em português", () => {
  it("troca de senha e Meu perfil sem campos respondem em português", async () => {
    const { admin } = await setup();
    await expect(admin.caller.auth.changePassword({} as never)).rejects.toThrow(/Informe a senha atual/);
    await expect(admin.caller.auth.changePassword({ atual: "x" } as never)).rejects.toThrow(/Informe a nova senha/);
    await expect(admin.caller.auth.changePassword({ atual: "x", nova: "123" })).rejects.toThrow(/Nova senha: mínimo de 6 caracteres/);
    await expect(admin.caller.perfil.atualizarConta({})).rejects.toThrow(/Informe o nome de usuário/);
    await expect(admin.caller.perfil.atualizarConta({})).rejects.not.toThrow(/Invalid|expected/);
  });
});

describe("P6-06: restaurar usuário excluído logicamente", () => {
  it("restaura pelo identificador, com auditoria 'Linha de comando', e a pessoa volta a entrar", async () => {
    const { repo, empresaId, admin } = await setup();
    const s = senha();
    const u = await createUser(repo, null, empresaId, { ...base("volta@teste.local", "VOL-1"), senha: s, perfil: "Operador", permissoes: { producao: "ver" } });
    await admin.caller.usuarios.remove({ id: u.id });
    await expect(restoreUser(repo, empresaId, "nao-existe", { autor: AUTOR_CLI })).rejects.toThrow(/Nenhum usuário excluído/);
    const out = await restoreUser(repo, empresaId, "vol-1", { autor: AUTOR_CLI });
    expect(out.user).toMatchObject({ id: u.id, email: "volta@teste.local", permissoes: { producao: "ver" } });
    const { items } = await repo.list<AuditEntry>("auditoria", empresaId, { filter: d => d.acao === "restaurar" });
    expect(items[0].data).toMatchObject({ usuario: AUTOR_CLI, registroId: u.id });
    const anon = (await import("./helpers")).callerFor;
    const c = await anon(repo);
    await expect(c.caller.auth.login({ identificador: "volta@teste.local", password: s })).resolves.toBeTruthy();
  });

  it("recusa se o e-mail já é de outra pessoa ativa; gera outro username se o antigo foi reaproveitado", async () => {
    const { repo, empresaId, admin } = await setup();
    const u = await createUser(repo, null, empresaId, { ...base("dup@teste.local", "DUP-1"), username: "dup", perfil: "Operador", permissoes: {} });
    await admin.caller.usuarios.remove({ id: u.id });
    const novo = await createUser(repo, null, empresaId, { ...base("dup@teste.local", "DUP-2"), username: "outro", perfil: "Operador", permissoes: {} });
    await expect(restoreUser(repo, empresaId, "DUP-1", { autor: AUTOR_CLI })).rejects.toThrow(/já pertence a outro usuário ativo/);
    await admin.caller.usuarios.update({ id: novo.id, data: { email: "outro@teste.local", username: "dup" } });
    const out = await restoreUser(repo, empresaId, "dup-1", { autor: AUTOR_CLI });
    expect(out.usernameTrocado).toBe(true);
    expect(out.user.username).not.toBe("dup");
  });
});
