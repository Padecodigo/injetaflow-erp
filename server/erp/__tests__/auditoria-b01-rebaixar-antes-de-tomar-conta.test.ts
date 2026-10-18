// Auditoria back-end (main 312ddd2), B-01 (alta): um não administrador com "Usuários: editar" contornava o R-01
// rebaixando primeiro quem tinha mais acesso e depois trocando a senha (conta tomada de ponta a ponta).
// Agora qualquer alteração ou exclusão de quem tem acesso MAIOR OU IGUAL fica com o administrador, e a negação é auditada.
import { describe, expect, it } from "vitest";
import { PERFIL_PRESETS, accessStrictlyBelow } from "@shared/erp/modules";
import { USERS } from "../auth";
import type { UserData } from "../types";
import { callerFor, createAndLogin, setup, USER_SENHA } from "./helpers";

const GESTOR_USUARIOS = { ...PERFIL_PRESETS.Gestor, usuarios: "editar" } as const;
const ALTO = { ...PERFIL_PRESETS.Gestor, financeiro: "editar", configuracoes: "editar" } as const;

async function cenario() {
  const { repo, empresaId, admin } = await setup();
  const gu = await createAndLogin(repo, empresaId, { email: "gu@t.local", perfil: "Gestor", permissoes: GESTOR_USUARIOS, matricula: "GU-1" });
  const alto = await createAndLogin(repo, empresaId, { email: "alto@t.local", perfil: "Gestor", permissoes: ALTO, matricula: "ALTO-1" });
  const altoId = (await alto.caller.auth.me())!.id;
  return { repo, empresaId, admin, gu, alto, altoId };
}

describe("B-01: R-01 não pode ser contornado por rebaixamento", () => {
  it("não remove módulos de quem tem acesso além do seu", async () => {
    const { gu, altoId } = await cenario();
    await expect(gu.caller.usuarios.update({ id: altoId, data: { permissoes: { dashboard: "ver" } } })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("não altera perfil, nome ou setor de quem tem acesso além do seu", async () => {
    const { gu, altoId } = await cenario();
    await expect(gu.caller.usuarios.update({ id: altoId, data: { perfil: "Consulta" } })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(gu.caller.usuarios.update({ id: altoId, data: { nome: "Renomeado", setor: "Produção" } })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("cadeia rebaixar → trocar senha não toma a conta (e a senha original continua valendo)", async () => {
    const { repo, empresaId, gu, altoId } = await cenario();
    await gu.caller.usuarios.update({ id: altoId, data: { permissoes: { dashboard: "ver" } } }).catch(() => undefined);
    await expect(gu.caller.usuarios.update({ id: altoId, data: { novaSenha: "senha-do-atacante-1" } })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(gu.caller.usuarios.remove({ id: altoId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await repo.get<UserData>(USERS, empresaId, altoId))!.data.permissoes).toMatchObject({ financeiro: "editar", configuracoes: "editar" });
    const anon = await callerFor(repo);
    await expect(anon.caller.auth.login({ email: "alto@t.local", password: "senha-do-atacante-1" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(anon.caller.auth.login({ email: "alto@t.local", password: USER_SENHA })).resolves.toBeTruthy();
  });

  it("acesso IGUAL também fica com o administrador (par não toma a conta do par)", async () => {
    const { repo, empresaId, gu } = await cenario();
    const par = await createAndLogin(repo, empresaId, { email: "par@t.local", perfil: "Gestor", permissoes: GESTOR_USUARIOS, matricula: "PAR-1" });
    const parId = (await par.caller.auth.me())!.id;
    await expect(gu.caller.usuarios.update({ id: parId, data: { novaSenha: "senha-do-atacante-1" } })).rejects.toThrow(/acesso igual ao seu/);
    await expect(gu.caller.usuarios.update({ id: parId, data: { permissoes: { dashboard: "ver" } } })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(gu.caller.usuarios.remove({ id: parId })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("quem está abaixo continua editável (senha, módulos, perfil) e o administrador segue com poder total", async () => {
    const { repo, empresaId, admin, gu, altoId } = await cenario();
    const op = await createAndLogin(repo, empresaId, { email: "op@t.local", perfil: "Operador", permissoes: { producao: "ver" }, matricula: "OP-1" });
    const opId = (await op.caller.auth.me())!.id;
    await expect(gu.caller.usuarios.update({ id: opId, data: { novaSenha: "nova-senha-op-1", perfil: "Consulta", permissoes: { producao: "editar" } } })).resolves.toMatchObject({ perfil: "Consulta" });
    await expect(admin.caller.usuarios.update({ id: altoId, data: { permissoes: { dashboard: "ver" } } })).resolves.toMatchObject({ permissoes: { dashboard: "ver" } });
  });

  it("a tentativa negada fica na auditoria", async () => {
    const { admin, gu, altoId } = await cenario();
    await gu.caller.usuarios.update({ id: altoId, data: { perfil: "Consulta" } }).catch(() => undefined);
    const { items } = await admin.caller.config.auditoria({ search: "Tentativa negada", pageSize: 10 });
    expect(items.some(i => i.modulo === "usuarios" && i.acao === "negado" && i.registroId === altoId)).toBe(true);
  });

  it("accessStrictlyBelow (regra compartilhada com a tela)", () => {
    const gu = { perfil: "Gestor", permissoes: GESTOR_USUARIOS };
    expect(accessStrictlyBelow(gu, { perfil: "Gestor", permissoes: ALTO })).toBe(false);
    expect(accessStrictlyBelow(gu, { perfil: "Gestor", permissoes: GESTOR_USUARIOS })).toBe(false);
    expect(accessStrictlyBelow(gu, { perfil: "Operador", permissoes: { producao: "ver" } })).toBe(true);
    expect(accessStrictlyBelow(gu, { perfil: "Administrador", permissoes: {} })).toBe(false);
    expect(accessStrictlyBelow({ perfil: "Administrador", permissoes: {} }, { perfil: "Administrador", permissoes: {} })).toBe(true);
  });
});
