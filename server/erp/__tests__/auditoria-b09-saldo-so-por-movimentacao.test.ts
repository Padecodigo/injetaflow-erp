import { describe, expect, it } from "vitest";
import { MODULES } from "@shared/erp/modules";
import { assertCamposSoNaCriacao } from "../records";
import { setup } from "./helpers";

/**
 * B-09 (média): records.update mudava o saldo do estoque direto (0 → 999999) sem movimentação, só com
 * "editar: item de estoque X" na auditoria; o razão do estoque deixava de fechar.
 * Correção: o saldo só se define na criação; depois, muda apenas por movimentação (que grava
 * saldoAnterior/saldoNovo e audita). A tela de edição não mostra o campo.
 */
describe("B-09: saldo só muda por movimentação", () => {
  it("unitário: o catálogo marca o saldo como só-na-criação; valor diferente é recusado, igual passa", () => {
    const estoque = MODULES.estoque;
    expect(estoque.fields.find(f => f.name === "saldo")?.readOnlyOnEdit).toMatch(/movimentação/);
    expect(() => assertCamposSoNaCriacao(estoque, { saldo: 5 }, { saldo: 100 })).toThrow(/O saldo só muda por movimentação/);
    expect(() => assertCamposSoNaCriacao(estoque, { saldo: "abc" }, { saldo: 100 })).toThrow(/movimentação/);
    expect(() => assertCamposSoNaCriacao(estoque, { saldo: "100" }, { saldo: 100 })).not.toThrow();
    expect(() => assertCamposSoNaCriacao(estoque, { material: "X" }, { saldo: 100 })).not.toThrow();
  });

  it("integração: editar o saldo pela API é recusado e nada muda; outros campos editam; a movimentação continua mudando o saldo com trilha", async () => {
    const { admin } = await setup();
    const item = await admin.caller.records.create({ module: "estoque", data: { codigo: "B09", material: "Resina", categoria: "Resina", saldo: 100, unidade: "kg", status: "Normal" } });
    await expect(admin.caller.records.update({ module: "estoque", id: item.id, data: { saldo: 999999 } })).rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringMatching(/O saldo só muda por movimentação/) });
    expect((await admin.caller.records.get({ module: "estoque", id: item.id })).saldo).toBe(100);

    await admin.caller.records.update({ module: "estoque", id: item.id, data: { material: "Resina PP", saldo: 100 } });
    expect((await admin.caller.records.get({ module: "estoque", id: item.id })).material).toBe("Resina PP");

    await admin.caller.records.create({ module: "movimentacoes", data: { item: "B09", tipo: "Ajuste", quantidade: "120", documento: "Inventário" } });
    expect((await admin.caller.records.get({ module: "estoque", id: item.id })).saldo).toBe(120);
    const movs = await admin.caller.records.list({ module: "movimentacoes", search: "B09" });
    expect(movs.items.some(m => m.tipo === "Ajuste" && Number(m.saldoAnterior) === 100 && Number(m.saldoNovo) === 120)).toBe(true);
    const audit = await admin.caller.config.auditoria({ search: "B09" });
    expect(audit.items.some(a => String(a.resumo).includes("(100 → 120)"))).toBe(true);
  });

  it("o formulário de edição não mostra o saldo (só na criação)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(path.resolve(__dirname, "../../../client/src/erp/components/RecordForm.tsx"), "utf8");
    expect(src).toMatch(/!\(editing && field\.readOnlyOnEdit\)/);
  });
});
