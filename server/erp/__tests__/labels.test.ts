import { describe, expect, it } from "vitest";
import { MODULES } from "@shared/erp/modules";
import { filterAllLabel } from "@shared/erp/labels";

describe("N09 — plural dos filtros", () => {
  it("N09: 'Todos os status' e 'Todas as situações' (nunca 'statuss'/'situaçãos')", () => {
    expect(filterAllLabel("Status")).toBe("Todos os status");
    expect(filterAllLabel("Situação")).toBe("Todas as situações");
    expect(filterAllLabel("Categoria")).toBe("Todas as categorias");
    expect(filterAllLabel("Setor")).toBe("Todos os setores");
  });

  it("N09: todo filtro de select do catálogo tem rótulo correto", () => {
    for (const mod of Object.values(MODULES)) {
      for (const field of mod.fields.filter(f => f.type === "select")) {
        const label = filterAllLabel(field.label);
        expect(label, `${mod.key}.${field.name}`).toMatch(/^Tod(o|a)s (os|as) /);
        expect(label).not.toMatch(/ss$|ãos$|ls$|rs$/);
      }
    }
  });
});
