import { describe, expect, it } from "vitest";
import { PERFIL_PRESETS } from "@shared/erp/modules";
import { PASSWORD_MIN_LENGTH, normalizeIdentifier, usernameError, usernameFromEmail } from "@shared/erp/account";
import { MemoryRepository } from "../repository";
import { USERS, resetLoginLimiter } from "../auth";
import { generatePassword, hashPassword, verifyPassword } from "../password";
import { ensureSeed } from "../seed";
import { createUser, migrateUsernames } from "../users";
import type { UserData } from "../types";
import { ADMIN, USER_SENHA, callerFor, createAndLogin, login, setup } from "./helpers";

// nenhuma senha fixa: todas geradas em tempo de execução
const senha6 = () => generatePassword(PASSWORD_MIN_LENGTH);

async function cenario() {
  const ctx = await setup();
  const senha = senha6();
  await createUser(ctx.repo, null, ctx.empresaId, { nome: "Operadora Login", email: "Maria.Silva@Teste.Local", username: "Maria.S", senha, setor: "Produção", perfil: "Operador", matricula: "mat-0099", permissoes: PERFIL_PRESETS.Operador, status: "Ativo" });
  return { ...ctx, senha };
}

describe("regras compartilhadas de conta", () => {
  it("deriva username do e-mail e valida formato", () => {
    expect(usernameFromEmail("Maria.Silva@x.com")).toBe("maria.silva");
    expect(usernameFromEmail("joão+obra@x.com")).toBe("joao.obra");
    expect(usernameFromEmail("a@x.com")).toHaveLength(3);
    expect(usernameError("admin")).toBeNull();
    for (const bad of ["ab", "com espaço", "x@y", "-abc", "a".repeat(41)]) expect(usernameError(bad), bad).not.toBeNull();
    expect(normalizeIdentifier("  ADMIN ")).toBe("admin");
  });
});

describe("login por e-mail, nome de usuário ou matrícula", () => {
  it("autentica pelos 3 identificadores (sem diferenciar maiúsculas) e audita o meio usado", async () => {
    const { repo, senha, admin } = await cenario();
    for (const identificador of ["maria.silva@teste.local", "MARIA.S", "maria.s", "MAT-0099", "mat-0099"]) {
      resetLoginLimiter();
      const anon = await callerFor(repo, undefined, "10.1.0.1");
      const me = await anon.caller.auth.login({ identificador, password: senha });
      expect(me.username, identificador).toBe("maria.s");
      expect(anon.jar.set.injetaflow_session?.value).toBeTruthy();
    }
    const audit = await admin.caller.config.auditoria({ search: "Login de maria", page: 1, pageSize: 20 });
    const resumos = audit.items.map(i => String((i as { resumo?: string }).resumo));
    expect(resumos.some(r => /via usuário/.test(r))).toBe(true);
    expect(resumos.some(r => /via matrícula/.test(r))).toBe(true);
    expect(resumos.some(r => /via e-mail/.test(r))).toBe(true);
  });

  it("compatibilidade: o campo antigo { email } continua funcionando", async () => {
    const { repo } = await setup();
    const anon = await callerFor(repo);
    await expect(anon.caller.auth.login({ email: ADMIN.email, password: ADMIN.senha })).resolves.toMatchObject({ username: "admin" });
  });

  it("identificador inexistente e senha errada dão a mesma mensagem genérica", async () => {
    const { repo } = await cenario();
    const anon = await callerFor(repo, undefined, "10.1.0.2");
    await expect(anon.caller.auth.login({ identificador: "maria.s", password: "errada!" })).rejects.toThrow("Usuário, e-mail, matrícula ou senha inválidos.");
    await expect(anon.caller.auth.login({ identificador: "ninguem", password: "errada!" })).rejects.toThrow("Usuário, e-mail, matrícula ou senha inválidos.");
    await expect(anon.caller.auth.login({ identificador: "  ", password: "x" })).rejects.toThrow(/Informe o e-mail, usuário ou matrícula/);
  });

  it("bloqueio por identificador normalizado (maiúsculas/espaços não escapam)", async () => {
    const { repo, senha } = await cenario();
    const anon = await callerFor(repo, undefined, "10.1.0.3");
    for (const variante of ["maria.s", "MARIA.S", " Maria.S ", "maria.S", "MARIA.s"]) await expect(anon.caller.auth.login({ identificador: variante, password: "errada!" })).rejects.toThrow(/inválidos/);
    await expect(anon.caller.auth.login({ identificador: "maria.s", password: senha })).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });

  it("bloqueio por conta: alternar e-mail/usuário/matrícula da mesma conta e trocar de IP não multiplica tentativas", async () => {
    const { repo, senha } = await cenario();
    const ids = ["maria.s", "mat-0099", "maria.silva@teste.local"];
    for (let i = 0; i < 10; i++) {
      const anon = await callerFor(repo, undefined, `10.2.0.${i}`);
      await expect(anon.caller.auth.login({ identificador: ids[i % 3], password: "errada!" })).rejects.toThrow(/inválidos/);
    }
    const outroIp = await callerFor(repo, undefined, "10.9.9.9");
    await expect(outroIp.caller.auth.login({ identificador: "mat-0099", password: senha })).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });

  it("apontamento rápido de produção por matrícula continua separado do login", async () => {
    const { admin } = await setup();
    await admin.caller.records.create({ module: "colaboradores", data: { matricula: "MAT-0500", nome: "Operador de chão", cargo: "Operador", setor: "Produção", turno: "1º turno (06–14)", admissao: "2026-01-02", status: "Ativo" } });
    await admin.caller.records.create({ module: "moldes", data: { codigo: "M-9", descricao: "Tampa", cavidades: "2", status: "Disponível" } });
    const op = await admin.caller.records.create({ module: "ordens", data: { cliente: "C", produto: "P", molde: "M-9", maquina: "INJ-1", quantidade: "100", prioridade: "Normal", status: "Em produção", entrega: "2026-12-01" } });
    const ap = await admin.caller.records.create({ module: "producao", data: { ordem: op.codigo, matricula: "MAT-0500", quantidadeBoa: "10", refugo: "0", turno: "1º turno" } });
    expect(ap.matricula).toBe("MAT-0500");
  });
});

describe("unicidade do nome de usuário", () => {
  it("único por empresa, case-insensitive, e sem colidir com matrícula", async () => {
    const { repo, admin, empresaId } = await cenario();
    const base = { nome: "Outra Pessoa", senha: senha6(), setor: "Produção" as const, perfil: "Operador" as const, permissoes: {}, status: "Ativo" as const };
    await expect(admin.caller.usuarios.create({ ...base, email: "o1@teste.local", username: "MARIA.S", matricula: "X-1" })).rejects.toThrow(/já está em uso/);
    await expect(admin.caller.usuarios.create({ ...base, email: "o2@teste.local", username: "mat-0099", matricula: "X-2" })).rejects.toThrow(/matrícula de outra pessoa/);
    await expect(admin.caller.usuarios.create({ ...base, email: "o3@teste.local", matricula: "maria.s" })).rejects.toThrow(/nome de usuário de outra pessoa/);
    // em outra empresa o mesmo username é permitido
    await createUser(repo, null, "empresa-b", { ...base, email: "o4@teste.local", username: "maria.s", matricula: "B-1" });
    // sem username: derivado do e-mail, com sufixo se já existir
    const u = await admin.caller.usuarios.create({ ...base, email: "maria.s@outro.local", matricula: "X-5" });
    expect(u.username).toBe("maria.s2");
    expect(empresaId).toBe("empresa-a");
  });
});

describe("política de senha (mínimo 6)", () => {
  it("6 caracteres aceitos; 5 recusados em criar, redefinir e trocar", async () => {
    const { admin } = await setup();
    expect(() => hashPassword(generatePassword(5))).toThrow(/6 caracteres/);
    const ok = senha6();
    const novo = await admin.caller.usuarios.create({ nome: "Senha Curta", email: "curta@teste.local", senha: ok, setor: "Produção", perfil: "Operador", matricula: "S-1", permissoes: {}, status: "Ativo" });
    await expect(admin.caller.usuarios.create({ nome: "Senha Curta 2", email: "curta2@teste.local", senha: generatePassword(5), setor: "Produção", perfil: "Operador", matricula: "S-2", permissoes: {}, status: "Ativo" })).rejects.toThrow(/mínimo de 6 caracteres/);
    await expect(admin.caller.usuarios.update({ id: novo.id, data: { novaSenha: generatePassword(5) } })).rejects.toThrow(/mínimo de 6 caracteres/);
    await expect(admin.caller.auth.changePassword({ atual: ADMIN.senha, nova: generatePassword(5) })).rejects.toThrow(/mínimo de 6 caracteres/);
  });
});

describe("Meu perfil: troca de senha e nome de usuário; matrícula bloqueada", () => {
  it("troca de senha exige a senha atual", async () => {
    const { repo, empresaId } = await setup();
    const senha = USER_SENHA;
    const colab = await createAndLogin(repo, empresaId, { email: "colab@teste.local", matricula: "C-0001" });
    const nova = senha6();
    await expect(colab.caller.auth.changePassword({ atual: "errada!", nova })).rejects.toThrow(/Senha atual incorreta/);
    await colab.caller.auth.changePassword({ atual: senha, nova });
    const anon = await callerFor(repo, undefined, "10.3.0.1");
    await expect(anon.caller.auth.login({ identificador: "C-0001", password: nova })).resolves.toMatchObject({ email: "colab@teste.local" });
  });

  it("muda o próprio nome de usuário (com unicidade) e entra com ele", async () => {
    const { repo, empresaId } = await setup();
    const colab = await createAndLogin(repo, empresaId, { email: "colab@teste.local", matricula: "C-0001" });
    await expect(colab.caller.perfil.atualizarConta({ username: "ADMIN" })).rejects.toThrow(/já está em uso/);
    await expect(colab.caller.perfil.atualizarConta({ username: "a b" })).rejects.toThrow(/Nome de usuário/);
    const out = await colab.caller.perfil.atualizarConta({ username: "Joao.Colab" });
    expect(out.username).toBe("joao.colab");
    const anon = await callerFor(repo, undefined, "10.3.0.2");
    await expect(anon.caller.auth.login({ identificador: "JOAO.COLAB", password: USER_SENHA })).resolves.toMatchObject({ matricula: "C-0001" });
  });

  it("colaborador NÃO muda matrícula, perfil, setor nem permissões via API", async () => {
    const { repo, empresaId } = await setup();
    const colab = await createAndLogin(repo, empresaId, { email: "colab@teste.local", matricula: "C-0001" });
    for (const extra of [{ matricula: "NOVA-1" }, { perfil: "Administrador" }, { setor: "Qualidade" }, { permissoes: { usuarios: "editar" } }]) {
      await expect(colab.caller.perfil.atualizarConta({ username: "colab", ...extra }), JSON.stringify(extra)).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    // sem permissão de Usuários também não consegue pela rota de administração
    const me = await colab.caller.auth.me();
    await expect(colab.caller.usuarios.update({ id: me!.id, data: { matricula: "NOVA-1" } })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const record = await repo.get<UserData>(USERS, empresaId, me!.id);
    expect(record!.data.matricula).toBe("C-0001");
    expect(record!.data.perfil).toBe("Operador");
  });
});

describe("Administrador tem poder total; outros perfis não alteram matrícula", () => {
  it("admin altera matrícula, username, e-mail, perfil, setor, módulos, status e senha — tudo auditado", async () => {
    const { repo, admin, empresaId } = await setup();
    const colab = await createAndLogin(repo, empresaId, { email: "colab@teste.local", matricula: "C-0001" });
    const me = await colab.caller.auth.me();
    const novaSenha = senha6();
    const out = await admin.caller.usuarios.update({ id: me!.id, data: { matricula: "c-0002", username: "Colab.Novo", email: "novo@teste.local", perfil: "Supervisor", setor: "Qualidade", permissoes: { qualidade: "editar" }, status: "Ativo", novaSenha } });
    expect(out).toMatchObject({ matricula: "C-0002", username: "colab.novo", email: "novo@teste.local", perfil: "Supervisor", setor: "Qualidade", permissoes: { qualidade: "editar" } });
    const record = await repo.get<UserData>(USERS, empresaId, me!.id);
    expect(verifyPassword(novaSenha, record!.data.senhaHash)).toBe(true);
    const audit = await admin.caller.config.auditoria({ search: "matrícula", page: 1, pageSize: 10 });
    const resumo = String((audit.items[0] as { resumo?: string }).resumo);
    expect(resumo).toMatch(/matrícula: "C-0001" → "C-0002"/);
    expect(resumo).toMatch(/nome de usuário/);
    expect(resumo).toMatch(/senha redefinida/);
    expect(resumo).not.toContain(novaSenha);
    // admin também altera a própria matrícula
    const adminMe = await admin.caller.auth.me();
    await expect(admin.caller.usuarios.update({ id: adminMe!.id, data: { matricula: "ADM-0009" } })).resolves.toMatchObject({ matricula: "ADM-0009" });
  });

  it("gestor com 'Usuários: editar' não muda matrícula de ninguém nem promove a Administrador", async () => {
    const { repo, empresaId } = await setup();
    const gestor = await createAndLogin(repo, empresaId, { email: "gestor@teste.local", perfil: "Gestor", permissoes: { ...PERFIL_PRESETS.Gestor, usuarios: "editar" }, matricula: "G-0001" });
    const alvo = await createUser(repo, null, empresaId, { nome: "Alvo Teste", email: "alvo@teste.local", senha: senha6(), setor: "Produção", perfil: "Operador", matricula: "A-0001", permissoes: {}, status: "Ativo" });
    await expect(gestor.caller.usuarios.update({ id: alvo.id, data: { matricula: "A-0002" } })).rejects.toThrow(/Somente o administrador pode alterar a matrícula/);
    const self = await gestor.caller.auth.me();
    await expect(gestor.caller.usuarios.update({ id: self!.id, data: { matricula: "G-0002" } })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(gestor.caller.usuarios.update({ id: alvo.id, data: { perfil: "Administrador" } })).rejects.toMatchObject({ code: "FORBIDDEN" });
    // pode editar outros campos de não administradores (mesma matrícula enviada é aceita)
    await expect(gestor.caller.usuarios.update({ id: alvo.id, data: { setor: "Qualidade", matricula: "A-0001", username: "alvo.q" } })).resolves.toMatchObject({ setor: "Qualidade", username: "alvo.q", matricula: "A-0001" });
  });
});

describe("migração automática do store e seed", () => {
  it("usuários antigos sem username recebem derivado do e-mail; admin inicial recebe 'admin'; nada se perde", async () => {
    const repo = new MemoryRepository();
    const hash = hashPassword(senha6());
    // simula um store antigo (sem o campo username)
    const adminRec = await repo.insert<UserData>(USERS, "wamovale", { nome: "Administrador Wamovale", email: "chefe@wamovale.local", senhaHash: hash, setor: "Administrativo", perfil: "Administrador", matricula: "ADM-0001", permissoes: {}, status: "Ativo", ultimoAcesso: null });
    const op = await repo.insert<UserData>(USERS, "wamovale", { nome: "Operador", email: "operador.demo@wamovale.local", senhaHash: hash, setor: "Produção", perfil: "Operador", matricula: "DEMO-OPE", permissoes: { producao: "editar" }, status: "Ativo", ultimoAcesso: "2026-10-01T10:00:00.000Z" });
    const dup = await repo.insert<UserData>(USERS, "wamovale", { nome: "Outro Operador", email: "operador.demo@outro.local", senhaHash: hash, setor: "Produção", perfil: "Operador", matricula: "X-9", permissoes: {}, status: "Inativo", ultimoAcesso: null });
    await repo.insert("ordens", "wamovale", { codigo: "OP-0001" });

    const { migrated } = await migrateUsernames(repo);
    expect(migrated).toBe(3);
    const get = async (id: string) => (await repo.get<UserData>(USERS, "wamovale", id))!.data;
    expect((await get(adminRec.id)).username).toBe("admin");
    expect((await get(op.id))).toMatchObject({ username: "operador.demo", email: "operador.demo@wamovale.local", senhaHash: hash, matricula: "DEMO-OPE", permissoes: { producao: "editar" }, ultimoAcesso: "2026-10-01T10:00:00.000Z" });
    expect((await get(dup.id)).username).toBe("operador.demo2");
    expect((await repo.list("ordens", "wamovale")).total).toBe(1);
    // idempotente
    expect((await migrateUsernames(repo)).migrated).toBe(0);
    // ensureSeed também roda a migração e não recria admin
    await expect(ensureSeed(repo, { log: () => {}, env: {} })).resolves.toMatchObject({ adminCreated: false });
  });

  it("seed de primeiro start cria o admin com username 'admin' e login 'admin' funciona", async () => {
    resetLoginLimiter();
    const repo = new MemoryRepository();
    const senha = senha6();
    const logs: string[] = [];
    await ensureSeed(repo, { log: m => logs.push(m), env: { INJETAFLOW_ADMIN_PASSWORD: senha, INJETAFLOW_SEED_DEMO: "false" } });
    expect(logs.join("\n")).not.toContain(senha);
    expect(logs.join("\n")).toMatch(/usuário "admin"/);
    const anon = await callerFor(repo);
    await expect(anon.caller.auth.login({ identificador: "admin", password: senha })).resolves.toMatchObject({ username: "admin", perfil: "Administrador", matricula: "ADM-0001" });
    await expect(login(repo, "admin@wamovale.local", senha)).resolves.toBeTruthy();
  });

  it("seed recusa senha de ambiente com menos de 6 caracteres", async () => {
    await expect(ensureSeed(new MemoryRepository(), { log: () => {}, env: { INJETAFLOW_ADMIN_PASSWORD: generatePassword(5) } })).rejects.toThrow(/pelo menos 6 caracteres/);
  });
});
