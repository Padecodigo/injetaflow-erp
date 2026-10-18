// Auditoria back-end, B-07 (média): a edição registrava só "editar: lançamento LF-0005" (sem antes → depois),
// exportações de dados pessoais e falhas de login não eram auditadas. Agora: diff campo a campo (sem senha),
// exportações (usuários, módulos, relatório de ponto), falhas, negações e bloqueios de login; a auditoria é append-only.
import { describe, expect, it } from "vitest";
import { MemoryRepository } from "../repository";
import { ADMIN, callerFor, setup } from "./helpers";

const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
type Admin = Awaited<ReturnType<typeof setup>>["admin"];
const ultimas = async (admin: Admin, search?: string) => (await admin.caller.config.auditoria({ search, pageSize: 100 })).items;

describe("B-07: trilha de auditoria", () => {
  it("edição de valor financeiro registra antes → depois", async () => {
    const { admin } = await setup();
    const lf = await admin.caller.records.create({ module: "financeiro", data: { tipo: "Conta a pagar", descricao: "Fornecedor X", valor: 10, vencimento: hoje, status: "Em aberto" } });
    await admin.caller.records.update({ module: "financeiro", id: lf.id, data: { valor: 999999, status: "Pago" } });
    const ed = (await ultimas(admin, String(lf.codigo))).find(i => i.acao === "editar");
    expect(ed?.resumo).toMatch(/10 → 999999/);
    expect(ed?.resumo).toMatch(/Em aberto → Pago/);
  });

  it("exportações (usuários, módulo e relatório de ponto) são auditadas com quantidade e filtros", async () => {
    const { admin } = await setup();
    await admin.caller.usuarios.exportCsv({ status: "Ativo" });
    await admin.caller.records.exportCsv({ module: "colaboradores", search: "ana" });
    await admin.caller.rh.relatorioCsv({ inicio: hoje, fim: hoje });
    const items = await ultimas(admin);
    expect(items.find(i => i.modulo === "usuarios" && i.acao === "exportar")?.resumo).toMatch(/1 linha\(s\).*status=Ativo/);
    expect(items.find(i => i.modulo === "colaboradores" && i.acao === "exportar")?.resumo).toMatch(/search=ana/);
    expect(items.some(i => i.modulo === "rh" && i.acao === "exportar")).toBe(true);
  });

  it("falha de login fica registrada (sem a senha tentada) e o bloqueio também", async () => {
    const { repo, admin } = await setup();
    const anon = await callerFor(repo, null, "7.7.7.7");
    for (let i = 0; i < 5; i++) await anon.caller.auth.login({ email: ADMIN.email, password: "senha-errada-xyz" }).catch(() => undefined);
    const items = await ultimas(admin);
    const falhas = items.filter(i => i.modulo === "auth" && i.acao === "login falhou");
    expect(falhas.length).toBe(5);
    expect(falhas[0].resumo).toMatch(/admin@teste\.local.*IP 7\.7\.7\.7/);
    expect(items.some(i => i.modulo === "auth" && i.acao === "bloqueio")).toBe(true);
    expect(JSON.stringify(items)).not.toContain("senha-errada-xyz");
  });

  it("login de usuário inativo é registrado como negado", async () => {
    const { repo, admin } = await setup();
    await admin.caller.usuarios.create({ nome: "Pessoa Inativa", email: "inativa@t.local", senha: "senha-inativa-1", setor: "Produção", perfil: "Consulta", matricula: "INA-1", status: "Inativo" });
    const anon = await callerFor(repo);
    await expect(anon.caller.auth.login({ email: "inativa@t.local", password: "senha-inativa-1" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await ultimas(admin)).some(i => i.acao === "login negado" && /inativo/.test(i.resumo))).toBe(true);
  });

  it("a auditoria é append-only também no repositório (update, exclusão e purga falham)", async () => {
    const repo = new MemoryRepository();
    const linha = await repo.insert("auditoria", "e1", { acao: "criar", modulo: "x", resumo: "linha" });
    await expect(repo.update("auditoria", "e1", linha.id, { resumo: "adulterada" })).rejects.toThrow(/append-only/);
    await expect(repo.softDelete("auditoria", "e1", linha.id)).rejects.toThrow(/append-only/);
    await expect(repo.restore("auditoria", "e1", linha.id)).rejects.toThrow(/append-only/);
    await expect(repo.purge("auditoria", () => true)).rejects.toThrow(/append-only/);
    expect((await repo.get<{ resumo: string }>("auditoria", "e1", linha.id))?.data.resumo).toBe("linha");
  });

  it("diff de usuário continua sem a senha (só \"senha redefinida\")", async () => {
    const { repo, empresaId, admin } = await setup();
    const u = await admin.caller.usuarios.create({ nome: "Pessoa Diff", email: "diff@t.local", senha: "senha-inicial-1", setor: "Produção", perfil: "Consulta", matricula: "DIF-1" });
    await admin.caller.usuarios.update({ id: u.id, data: { novaSenha: "senha-nova-secreta-1", setor: "Qualidade" } });
    const items = await ultimas(admin, "Pessoa Diff");
    expect(items[0].resumo).toMatch(/setor: "Produção" → "Qualidade"/);
    expect(items[0].resumo).toMatch(/senha redefinida/);
    expect(JSON.stringify(await repo.list("auditoria", empresaId))).not.toMatch(/senha-nova-secreta-1|senha-inicial-1|scrypt\$/);
  });
});
