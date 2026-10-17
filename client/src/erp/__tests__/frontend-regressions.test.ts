import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { ERP_ROUTES, PUBLIC_ROUTES } from "@shared/erp/routes";
import { MODULES } from "@shared/erp/modules";

const root = process.cwd();
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === "__tests__" ? [] : walk(full);
    return /\.(tsx?|css)$/.test(name) && !name.includes(".test.") ? [full] : [];
  });
}

describe("regressões do frontend (aceite PR #1)", () => {
  it("B12: nenhuma credencial de demonstração ou autenticação client-side no código do cliente", () => {
    const files = walk(resolve(root, "client/src"));
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toContain("adm123");
      expect(source, file).not.toContain("demo-auth");
      expect(source, file).not.toContain("authenticateDemoUser");
    }
  });

  it("B01/B04/B10: toda rota privada do ERP passa por RequireAuth com permissão", () => {
    const app = read("client/src/App.tsx");
    expect(app).toContain("<RequireAuth permission={route.permission}>");
    expect(app).toContain("ERP_ROUTES.map");
    for (const route of ERP_ROUTES) expect(app, route.path).toContain(`"${route.path}":`);
    // o portal público não renderiza o ERP
    expect(read("client/src/pages/Home.tsx")).not.toContain("app-shell");
  });

  it("B16: rota desconhecida cai no NotFound em português", () => {
    const app = read("client/src/App.tsx");
    expect(app).toContain("<Route component={NotFound} />");
    const notFound = read("client/src/pages/NotFound.tsx");
    expect(notFound).toContain("Página não encontrada");
    expect(notFound).not.toContain("Page Not Found");
  });

  it("B15: a data do topo é calculada, não fixa", () => {
    const layout = read("client/src/erp/ErpLayout.tsx");
    expect(layout).not.toContain("16 out. 2026");
    expect(read("client/src/erp/pages/DashboardPage.tsx")).not.toContain("16 de outubro");
  });

  it("B17/B18: portal tem menu mobile e links para todas as páginas públicas", () => {
    const home = read("client/src/pages/Home.tsx");
    expect(home).toContain("public-menu-toggle");
    for (const path of PUBLIC_ROUTES.filter(p => p !== "/")) expect(home, path).toContain(`href="${path}"`);
  });

  it("B19/B20/B21: formulários públicos enviam ao servidor (sem envio fingido)", () => {
    const home = read("client/src/pages/Home.tsx");
    expect(home).toContain("trpc.publico.enviarSolicitacao");
    expect(home).toContain('tipo: "Cotação"');
    expect(home).toContain('tipo: "Contato"');
    expect(home).toContain('tipo: "Currículo"');
    expect(home).not.toContain("setSubmitted(true)");
  });

  it("B05: formulários e colunas vêm do catálogo por nome de campo (não por posição)", () => {
    for (const mod of Object.values(MODULES)) {
      const names = new Set(mod.fields.map(f => f.name));
      for (const column of mod.columns) {
        expect(names.has(column) || ["id", "createdAt", "updatedAt", "createdBy", "operador", "produzido", "progresso", "saldoAtual"].includes(column) || mod.fields.length === 0, `${mod.key}.${column}`).toBe(true);
      }
    }
    const table = read("client/src/erp/components/ModuleCrud.tsx");
    expect(table).toContain("const value = row[column];");
  });

  it("B22: listas do RH usam id como key", () => {
    const rh = read("client/src/erp/pages/RhPage.tsx");
    expect(rh).not.toMatch(/key=\{(item|row|p)\.nome\}/);
  });

  it("B24: cadeado no menu depende da permissão do usuário", () => {
    const layout = read("client/src/erp/ErpLayout.tsx");
    expect(layout).toMatch(/can\(route\.permission\)/);
  });

  it("B13: cards de Configurações navegam ou estão marcados como Em breve", () => {
    const cfg = read("client/src/erp/pages/ConfiguracoesPage.tsx");
    expect(cfg).toContain('navigate("/usuarios")');
    expect(cfg).toContain("Em breve");
    expect(cfg).toContain('getElementById("regras")');
  });

  it("B14: Meu perfil tem filtro de período e histórico completo, sem avaliações fictícias", () => {
    const perfil = read("client/src/erp/pages/MeuPerfilPage.tsx");
    expect(perfil).toContain("Este mês");
    expect(perfil).toContain("Ver histórico completo");
    expect(perfil).not.toContain("Ver avaliações");
  });

  it("B03: há botão Sair no menu do usuário e em Meu perfil", () => {
    expect(read("client/src/erp/ErpLayout.tsx")).toContain("Sair");
    expect(read("client/src/erp/pages/MeuPerfilPage.tsx")).toContain("Sair");
  });

  it("B23: toasts coerentes (limpa erro anterior, sem 'Ação autorizada' ao abrir, sem concordância errada)", () => {
    const form = read("client/src/erp/components/RecordForm.tsx");
    expect(form.indexOf("toast.dismiss()")).toBeGreaterThan(-1);
    expect(form.indexOf("toast.dismiss()")).toBeLessThan(form.indexOf('toast.success(editing ? "Alterações salvas" : "Registro criado"'));
    expect(read("client/src/erp/pages/LoginPage.tsx")).toContain("toast.dismiss()");
    for (const file of walk(resolve(root, "client/src"))) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toContain("Ação autorizada");
      expect(source, file).not.toMatch(/Nova [a-zç ]+ criado\b/);
    }
  });

  it("B25: nenhum texto promete acesso público a módulos do ERP", () => {
    for (const file of walk(resolve(root, "client/src"))) {
      expect(readFileSync(file, "utf8"), file).not.toContain("Acesso público continua disponível");
    }
  });
});
