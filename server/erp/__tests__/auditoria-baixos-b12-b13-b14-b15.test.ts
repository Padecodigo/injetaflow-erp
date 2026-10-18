// Auditoria back-end, achados baixos corrigidos no PR de segurança:
// B-12 limite de tentativas da senha atual; B-13 limites de entrada; B-14 records.options só com campos de `ref`;
// B-15 a mudança automática da ordem para "Em produção" tem ator, auditoria e acontece depois do apontamento.
import { describe, expect, it } from "vitest";
import { PERFIL_PRESETS } from "@shared/erp/modules";
import { dataDeCalendarioValida, semCaracteresDeControle } from "../text";
import { camposDeReferencia } from "../router";
import { ADMIN, createAndLogin, setup } from "./helpers";

const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const est = (over: Record<string, unknown>) => ({ codigo: `L-${Math.random().toString(36).slice(2, 7)}`, material: "M", categoria: "Resina", saldo: 1, unidade: "kg", status: "Normal", ...over });

describe("B-12: limite de tentativas da senha atual", () => {
  it("após 5 senhas atuais erradas responde TOO_MANY_REQUESTS (inclusive com a senha certa)", async () => {
    const { admin } = await setup();
    for (let i = 0; i < 5; i++) await expect(admin.caller.auth.changePassword({ atual: `chute-${i}`, nova: "qualquer-nova-1" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(admin.caller.auth.changePassword({ atual: "chute-x", nova: "qualquer-nova-1" })).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    await expect(admin.caller.auth.changePassword({ atual: ADMIN.senha, nova: "qualquer-nova-1" })).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });

  it("o mesmo limite vale para a senha atual em usuarios.update (B-02)", async () => {
    const { admin } = await setup();
    const me = (await admin.caller.auth.me())!;
    for (let i = 0; i < 5; i++) await admin.caller.usuarios.update({ id: me.id, data: { novaSenha: "nova-senha-1", senhaAtual: `chute-${i}` } }).catch(() => undefined);
    await expect(admin.caller.usuarios.update({ id: me.id, data: { novaSenha: "nova-senha-1", senhaAtual: ADMIN.senha } })).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });

  it("acerto antes do limite zera a contagem", async () => {
    const { admin } = await setup();
    for (let i = 0; i < 4; i++) await admin.caller.auth.changePassword({ atual: `chute-${i}`, nova: "qualquer-nova-1" }).catch(() => undefined);
    await expect(admin.caller.auth.changePassword({ atual: ADMIN.senha, nova: "qualquer-nova-1" })).resolves.toEqual({ success: true });
  });
});

describe("B-13: limites de entrada", () => {
  it("recusa data de calendário impossível (formulário e filtros)", async () => {
    const { admin } = await setup();
    await expect(admin.caller.records.create({ module: "estoque", data: est({ validade: "2026-13-45" }) })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(admin.caller.records.create({ module: "estoque", data: est({ validade: "2026-02-30" }) })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(admin.caller.records.create({ module: "estoque", data: est({ validade: "2028-02-29" }) })).resolves.toBeTruthy();
    await expect(admin.caller.rh.relatorio({ inicio: "2026-13-01", fim: "2026-13-02" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect([dataDeCalendarioValida("2026-04-31"), dataDeCalendarioValida("2026-04-30"), dataDeCalendarioValida("26-04-30")]).toEqual([false, true, false]);
  });

  it("recusa busca/filtros gigantes em Usuários", async () => {
    const { admin } = await setup();
    await expect(admin.caller.usuarios.exportCsv({ search: "x".repeat(10_000) })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(admin.caller.usuarios.list({ perfil: "x".repeat(10_000) })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(admin.caller.usuarios.list({ setor: "x".repeat(61) })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("recusa caracteres de controle e de inversão de direção em texto; quebra de linha em textarea continua aceita", async () => {
    const { admin } = await setup();
    await expect(admin.caller.records.create({ module: "estoque", data: est({ material: "a\u0000b" }) })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(admin.caller.records.create({ module: "estoque", data: est({ material: "fatura\u202Etxt.exe" }) })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(admin.caller.usuarios.create({ nome: "Nome\u202Eoculto", email: "ctl@t.local", senha: "senha-ctl-1", setor: "Produção", perfil: "Consulta", matricula: "CTL-1" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(semCaracteresDeControle("linha 1\nlinha 2\tok")).toBe(true);
    expect(semCaracteresDeControle("a\u2066b")).toBe(false);
  });
});

describe("B-14: records.options só para campos de referência declarados", () => {
  it("campo fora da definição de ref é recusado", async () => {
    const { admin } = await setup();
    await expect(admin.caller.records.options({ module: "estoque", field: "constructor" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(admin.caller.records.options({ module: "moldes", field: "ciclos" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(admin.caller.records.options({ module: "moldes", field: "codigo", labelField: "observacoes" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("os campos usados pelas telas continuam funcionando, inclusive para quem só edita o módulo que referencia", async () => {
    const { repo, empresaId, admin } = await setup();
    expect([...camposDeReferencia("moldes")].sort()).toEqual(["codigo", "descricao"]);
    await admin.caller.records.create({ module: "moldes", data: { codigo: "M-OPT", descricao: "Molde opções", cavidades: 2, status: "Disponível" } });
    const pcp = await createAndLogin(repo, empresaId, { email: "pcp@t.local", perfil: "Operador", permissoes: { ordens: "editar" } as typeof PERFIL_PRESETS.Operador, matricula: "PCP-1" });
    await expect(pcp.caller.records.options({ module: "moldes", field: "codigo", labelField: "descricao" })).resolves.toEqual([expect.objectContaining({ value: "M-OPT", label: "Molde opções" })]);
  });
});

describe("B-15: efeito colateral da regra de produção é auditado", () => {
  it("mudança automática de status da ordem tem ator e linha de auditoria, depois do apontamento", async () => {
    const { admin } = await setup();
    await admin.caller.records.create({ module: "colaboradores", data: { matricula: "MAT-T1", nome: "Operador T", cargo: "Op", setor: "Produção", turno: "1º turno (06–14)", status: "Ativo" } });
    await admin.caller.records.create({ module: "moldes", data: { codigo: "M-T1", descricao: "Molde T", cavidades: 4, status: "Disponível" } });
    const op = await admin.caller.records.create({ module: "ordens", data: { produto: "Tampa", molde: "M-T1", maquina: "INJ-1", quantidade: 100, prioridade: "Normal", status: "Liberada", entrega: hoje } });
    const ap = await admin.caller.records.create({ module: "producao", data: { ordem: op.codigo, matricula: "MAT-T1", quantidadeBoa: 10, turno: "1º turno" } });
    const ordem = await admin.caller.records.get({ module: "ordens", id: op.id });
    expect(ordem.status).toBe("Em produção");
    expect(ordem.atualizadoPor).toBe("Admin Teste");
    const aud = await admin.caller.config.auditoria({ search: String(op.codigo), pageSize: 50 });
    const linha = aud.items.find(i => i.modulo === "ordens" && /Liberada" → "Em produção/.test(i.resumo));
    expect(linha).toBeTruthy();
    // a mudança vem DEPOIS do apontamento gravado
    expect(new Date(ordem.updatedAt).getTime()).toBeGreaterThanOrEqual(new Date(ap.createdAt).getTime());
  });

  it("apontamento recusado (matrícula inexistente) não muda a ordem", async () => {
    const { admin } = await setup();
    await admin.caller.records.create({ module: "moldes", data: { codigo: "M-T2", descricao: "Molde T2", cavidades: 4, status: "Disponível" } });
    const op = await admin.caller.records.create({ module: "ordens", data: { produto: "Tampa", molde: "M-T2", maquina: "INJ-1", quantidade: 100, prioridade: "Normal", status: "Liberada", entrega: hoje } });
    await expect(admin.caller.records.create({ module: "producao", data: { ordem: op.codigo, matricula: "NAO-EXISTE", quantidadeBoa: 10, turno: "1º turno" } })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect((await admin.caller.records.get({ module: "ordens", id: op.id })).status).toBe("Liberada");
  });
});
