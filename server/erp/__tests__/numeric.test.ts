import { describe, expect, it } from "vitest";
import { MODULES } from "@shared/erp/modules";
import { numericError, parseNumeric } from "@shared/erp/numbers";
import { validateInput } from "../records";
import { setup } from "./helpers";

describe("campos numéricos aceitam só números (requisito do cliente: quantidade/valor/peso/estoque/ciclo/cavidades)", () => {
  it("parseNumeric aceita inteiros e decimais com vírgula ou ponto e recusa texto", () => {
    expect(parseNumeric("1500")).toBe(1500);
    expect(parseNumeric(" 12,5 ")).toBe(12.5);
    expect(parseNumeric("12.5")).toBe(12.5);
    expect(parseNumeric(7)).toBe(7);
    for (const bad of ["", "12abc", "abc", "1e3", "1.2.3", "R$ 10", "10 kg", null, undefined, Number.NaN, Infinity, "--1"]) expect(parseNumeric(bad), String(bad)).toBeNull();
  });

  it("numericError dá mensagem clara para texto, negativo, decimal em inteiro e limites", () => {
    expect(numericError("abc", { label: "Quantidade", integer: true })).toBe("Quantidade: use apenas números inteiros (ex.: 1500).");
    expect(numericError("-1", { label: "Peso" })).toBe("Peso: não pode ser negativo.");
    expect(numericError("1,5", { label: "Cavidades", integer: true })).toBe("Cavidades: use um número inteiro, sem vírgula ou ponto (ex.: 1500).");
    expect(numericError("0", { label: "Cavidades", integer: true, min: 1 })).toBe("Cavidades: o mínimo é 1.");
    expect(numericError("101", { label: "Concentração", max: 100 })).toBe("Concentração: o máximo é 100.");
    expect(numericError("10", { label: "Valor" })).toBeNull();
  });

  it("todo campo number/money do catálogo recusa texto e negativo no servidor", () => {
    for (const mod of Object.values(MODULES)) {
      for (const field of mod.fields.filter(f => (f.type === "number" || f.type === "money") && !f.readOnly)) {
        for (const bad of ["12abc", "-5", "dez"]) {
          expect(() => validateInput(mod, { [field.name]: bad }, "update"), `${mod.key}.${field.name}=${bad}`).toThrow(new RegExp(field.label.replace(/[()$%]/g, "\\$&")));
        }
        const ok = validateInput(mod, { [field.name]: String(Math.max(field.min ?? 0, 1)) }, "update");
        expect(ok[field.name], `${mod.key}.${field.name}`).toBe(Math.max(field.min ?? 0, 1));
      }
    }
  });

  it("quantidade de peças é inteira; obrigatório vazio não vira zero", () => {
    expect(() => validateInput(MODULES.ordens, { quantidade: "10,5" }, "update")).toThrow(/inteiro/);
    expect(() => validateInput(MODULES.ordens, { quantidade: "" }, "create")).toThrow(/Quantidade planejada: obrigatório/);
    expect(() => validateInput(MODULES.producao, { quantidadeBoa: "1e3" }, "update")).toThrow(/apenas números/);
  });

  it("regressão: criar via API com quantidade em texto é recusado e nada é gravado", async () => {
    const { admin } = await setup();
    await admin.caller.records.create({ module: "moldes", data: { codigo: "M-1", descricao: "Tampa", cavidades: "4", status: "Disponível" } });
    await expect(admin.caller.records.create({ module: "ordens", data: { cliente: "C", produto: "P", molde: "M-1", maquina: "INJ-1", quantidade: "mil", prioridade: "Alta", status: "Planejada", entrega: "2026-10-20" } })).rejects.toThrow(/Quantidade planejada: use apenas números/);
    await expect(admin.caller.records.create({ module: "estoque", data: { item: "Resina", tipo: "Matéria-prima", saldo: "-3", unidade: "kg", status: "Normal" } })).rejects.toThrow(/não pode ser negativo/);
    expect((await admin.caller.records.list({ module: "ordens" })).total).toBe(0);
  });
});
