import { describe, expect, it } from "vitest";
import { setup } from "./helpers";
import { registrarPontoDemonstracao } from "../ponto-demonstracao";

async function seedItem(caller: Awaited<ReturnType<typeof setup>>["admin"]["caller"], codigo = "RES-PP-01", saldo = 5000) {
  await caller.records.create({ module: "estoque", data: { codigo, material: "PP", categoria: "Resina", saldo, unidade: "kg", estoqueMinimo: 100, status: "Normal" } });
}
async function saldoDe(caller: Awaited<ReturnType<typeof setup>>["admin"]["caller"], codigo = "RES-PP-01") {
  const list = await caller.records.list({ module: "estoque", search: codigo });
  return list.items.find(i => i.codigo === codigo)!.saldo;
}

describe("N02: excluir/editar movimentação recalcula o saldo, com auditoria", () => {
  it("excluir saída estorna o saldo (4990 → 5000) e registra auditoria", async () => {
    const { admin } = await setup();
    await seedItem(admin.caller);
    const mov = await admin.caller.records.create({ module: "movimentacoes", data: { item: "RES-PP-01", tipo: "Saída", quantidade: "10" } });
    expect(await saldoDe(admin.caller)).toBe(4990);
    await admin.caller.records.remove({ module: "movimentacoes", id: mov.id });
    expect(await saldoDe(admin.caller)).toBe(5000);
    const audit = await admin.caller.config.auditoria({ search: "Estorno" });
    expect(audit.items[0].resumo).toMatch(/Estorno de Saída de 10 em RES-PP-01 \(saldo de RES-PP-01 4990 → 5000\)/);
  });

  it("excluir entrada estorna; se o estorno deixaria saldo negativo, é recusado", async () => {
    const { admin } = await setup();
    await seedItem(admin.caller, "EMB-CX-01", 0);
    const entrada = await admin.caller.records.create({ module: "movimentacoes", data: { item: "EMB-CX-01", tipo: "Entrada", quantidade: "100" } });
    await admin.caller.records.create({ module: "movimentacoes", data: { item: "EMB-CX-01", tipo: "Saída", quantidade: "80" } });
    await expect(admin.caller.records.remove({ module: "movimentacoes", id: entrada.id })).rejects.toThrow(/ficaria negativo/);
    expect(await saldoDe(admin.caller, "EMB-CX-01")).toBe(20);
  });

  it("excluir ajuste restaura o saldo anterior", async () => {
    const { admin } = await setup();
    await seedItem(admin.caller);
    const ajuste = await admin.caller.records.create({ module: "movimentacoes", data: { item: "RES-PP-01", tipo: "Ajuste", quantidade: "4200" } });
    expect(await saldoDe(admin.caller)).toBe(4200);
    await admin.caller.records.remove({ module: "movimentacoes", id: ajuste.id });
    expect(await saldoDe(admin.caller)).toBe(5000);
  });

  it("editar quantidade/tipo desfaz o efeito antigo e aplica o novo; texto não mexe no saldo", async () => {
    const { admin } = await setup();
    await seedItem(admin.caller);
    const mov = await admin.caller.records.create({ module: "movimentacoes", data: { item: "RES-PP-01", tipo: "Saída", quantidade: "10" } });
    await admin.caller.records.update({ module: "movimentacoes", id: mov.id, data: { quantidade: "25" } });
    expect(await saldoDe(admin.caller)).toBe(4975);
    await admin.caller.records.update({ module: "movimentacoes", id: mov.id, data: { tipo: "Entrada" } });
    expect(await saldoDe(admin.caller)).toBe(5025);
    await admin.caller.records.update({ module: "movimentacoes", id: mov.id, data: { documento: "NF 123" } });
    expect(await saldoDe(admin.caller)).toBe(5025);
    const audit = await admin.caller.config.auditoria({ search: "recalculada" });
    expect(audit.total).toBe(2);
  });

  it("editar para um item diferente devolve o saldo ao item antigo", async () => {
    const { admin } = await setup();
    await seedItem(admin.caller, "A-1", 100);
    await seedItem(admin.caller, "B-1", 100);
    const mov = await admin.caller.records.create({ module: "movimentacoes", data: { item: "A-1", tipo: "Saída", quantidade: "30" } });
    await admin.caller.records.update({ module: "movimentacoes", id: mov.id, data: { item: "B-1" } });
    expect(await saldoDe(admin.caller, "A-1")).toBe(100);
    expect(await saldoDe(admin.caller, "B-1")).toBe(70);
  });

  it("N03: entrada que estouraria o teto do saldo é recusada", async () => {
    const { admin } = await setup();
    await seedItem(admin.caller, "BIG-1", 999_999_000);
    await expect(admin.caller.records.create({ module: "movimentacoes", data: { item: "BIG-1", tipo: "Entrada", quantidade: "5000" } })).rejects.toThrow(/máximo permitido/);
  });
});

describe("N11: marcação de ponto não pode ser excluída nem editada", () => {
  it("excluir/editar ponto → FORBIDDEN com orientação de ocorrência", async () => {
    const { repo, admin } = await setup();
    await admin.caller.records.create({ module: "colaboradores", data: { matricula: "MAT-9", nome: "Pessoa", cargo: "Op", setor: "Produção", turno: "1º turno (06–14)", status: "Ativo" } });
    await registrarPontoDemonstracao(repo, (await admin.caller.auth.me())!, { matricula: "MAT-9", tipo: "Entrada", demo: true });
    const list = await admin.caller.records.list({ module: "ponto" });
    const id = list.items[0].id;
    await expect(admin.caller.records.remove({ module: "ponto", id })).rejects.toMatchObject({ code: "FORBIDDEN", message: expect.stringMatching(/Portaria 671/) });
    await expect(admin.caller.records.update({ module: "ponto", id, data: { observacao: "x" } })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await admin.caller.records.list({ module: "ponto" })).total).toBe(1);
  });
});
