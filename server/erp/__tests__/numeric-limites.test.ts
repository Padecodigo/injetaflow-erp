import { describe, expect, it } from "vitest";
import { MODULES } from "@shared/erp/modules";
import { DEFAULT_MAX, MONEY_MAX, numericError } from "@shared/erp/numbers";
import { validateInput } from "../records";
import { setup } from "./helpers";

describe("N03 — limite máximo em todos os numéricos", () => {
  it("N03: valor de 20 dígitos é recusado (nunca gravado como 1e20)", () => {
    const vinte = "12345678901234567890";
    expect(numericError(vinte, { label: "Saldo" })).toBe("Saldo: o máximo é 1.000.000.000.");
    expect(numericError(vinte, { label: "Valor", money: true })).toMatch(/o máximo é 1\.000\.000\.000\.000/);
    for (const mod of Object.values(MODULES)) {
      for (const field of mod.fields.filter(f => (f.type === "number" || f.type === "money") && !f.readOnly)) {
        expect(() => validateInput(mod, { [field.name]: vinte }, "update"), `${mod.key}.${field.name}`).toThrow(/o máximo é/);
      }
    }
  });

  it("N03: limites padrão razoáveis e casas decimais controladas", () => {
    expect(numericError(String(DEFAULT_MAX), { label: "Peso" })).toBeNull();
    expect(numericError(String(DEFAULT_MAX + 1), { label: "Peso" })).toMatch(/máximo/);
    expect(numericError(String(MONEY_MAX), { label: "Valor", money: true })).toBeNull();
    expect(numericError("10,123", { label: "Valor", money: true })).toBe("Valor: no máximo 2 casas decimais.");
    expect(numericError("1,1234", { label: "Peso" })).toBe("Peso: no máximo 3 casas decimais.");
    expect(() => validateInput(MODULES.moldes, { cavidades: "5000" }, "update")).toThrow(/Cavidades.*máximo é 1\.024/);
  });

  it("N03: via API, 20 dígitos no saldo do estoque não grava nada", async () => {
    const { admin } = await setup();
    await expect(admin.caller.records.create({ module: "estoque", data: { item: "Resina PP", tipo: "Resina", saldo: "12345678901234567890", unidade: "kg", status: "Normal" } })).rejects.toThrow(/máximo/);
    expect((await admin.caller.records.list({ module: "estoque" })).total).toBe(0);
  });
});

describe("N04 — decimal em campo inteiro é recusado com mensagem", () => {
  it("N04: '1.5', '1,5' e '1e5' em inteiro nunca viram 15/100000", () => {
    for (const bad of ["1.5", "1,5", "1.500"]) {
      expect(numericError(bad, { label: "Cavidades", integer: true }), bad).toBe("Cavidades: use um número inteiro, sem vírgula ou ponto (ex.: 1500).");
      expect(() => validateInput(MODULES.moldes, { cavidades: bad }, "update"), bad).toThrow(/sem vírgula ou ponto/);
    }
    expect(() => validateInput(MODULES.ordens, { quantidade: "1e5" }, "update")).toThrow(/apenas números/);
    expect(() => validateInput(MODULES.moldes, { cavidades: 1.5 }, "update")).toThrow(/inteiro/);
    expect(validateInput(MODULES.moldes, { cavidades: "15" }, "update").cavidades).toBe(15);
  });
});

describe("N05 — meta de produção diária na configuração", () => {
  it("N05: vazio é recusado (não vira 0); decimal recusado; valor válido salvo", async () => {
    const { admin } = await setup();
    const atual = await admin.caller.config.get();
    const base = { nomeExibicao: atual.nomeExibicao, unidade: atual.unidade ?? "", fusoHorario: atual.fusoHorario, metaRefugoPct: "3" };
    await expect(admin.caller.config.update({ ...base, metaProducaoDiaria: "" })).rejects.toThrow(/Meta de produção diária \(peças\): obrigatório/);
    await expect(admin.caller.config.update({ ...base, metaProducaoDiaria: "1.5" })).rejects.toThrow(/sem vírgula ou ponto/);
    await expect(admin.caller.config.update({ ...base, metaProducaoDiaria: "100", metaRefugoPct: "150" })).rejects.toThrow(/Meta de refugo.*máximo é 100/);
    await admin.caller.config.update({ ...base, metaProducaoDiaria: "12000" });
    expect((await admin.caller.config.get()).metaProducaoDiaria).toBe(12000);
  });
});
