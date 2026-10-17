import { describe, expect, it } from "vitest";
import { isKnownSpaRoute, ERP_ROUTES } from "@shared/erp/routes";
import { spaStatus } from "../../_core/vite";
import { MODULES, PERMISSION_KEYS, hasPermission } from "@shared/erp/modules";

describe("rotas e 404 real", () => {
  it("rota inexistente responde 404; conhecidas respondem 200", () => {
    expect(spaStatus("/rota-que-nao-existe")).toBe(404);
    expect(spaStatus("/dashboard/extra")).toBe(404);
    expect(spaStatus("/api/qualquer")).toBe(404);
    expect(spaStatus("/")).toBe(200);
    expect(spaStatus("/producao?q=OP")).toBe(200);
    expect(spaStatus("/erp")).toBe(200);
  });

  it("qualidade pública e qualidade do ERP são rotas separadas", () => {
    expect(isKnownSpaRoute("/qualidade-institucional")).toBe(true);
    expect(ERP_ROUTES.find(r => r.path === "/qualidade")?.permission).toBe("qualidade");
    expect(ERP_ROUTES.find(r => r.path === "/qualidade-institucional")).toBeUndefined();
  });

  it("toda rota privada (exceto Meu perfil) exige uma permissão de módulo", () => {
    for (const route of ERP_ROUTES) {
      if (route.path === "/meu-perfil") expect(route.permission).toBeNull();
      else expect(PERMISSION_KEYS).toContain(route.permission);
    }
    for (const mod of Object.values(MODULES)) expect(PERMISSION_KEYS).toContain(mod.permission);
  });

  it("regra de permissão: admin tudo, 'ver' não edita, ausência nega", () => {
    expect(hasPermission({ perfil: "Administrador", permissoes: {} }, "financeiro", "editar")).toBe(true);
    expect(hasPermission({ perfil: "Operador", permissoes: { financeiro: "ver" } }, "financeiro", "ver")).toBe(true);
    expect(hasPermission({ perfil: "Operador", permissoes: { financeiro: "ver" } }, "financeiro", "editar")).toBe(false);
    expect(hasPermission({ perfil: "Operador", permissoes: {} }, "financeiro")).toBe(false);
    expect(hasPermission(null, "dashboard")).toBe(false);
  });
});
