import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Regressões estáticas da auditoria de frontend (312ddd2), achados altos F-01..F-06. */
const root = process.cwd();
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

describe("auditoria de frontend: achados altos", () => {
  it("F-01/F-08: formulários em modal não usam toast para erro (erro curto no modal, role=alert)", () => {
    const form = read("client/src/erp/components/RecordForm.tsx");
    expect(form).not.toContain("Confira os campos destacados");
    expect(form).not.toMatch(/toast\.error\(/);
    expect(form).toContain("campos para conferir.");
    const usuarios = read("client/src/erp/pages/UsuariosPage.tsx");
    const userForm = usuarios.slice(usuarios.indexOf("const submit"), usuarios.indexOf("const selected"));
    expect(userForm).not.toMatch(/toast\.error\(/);
  });

  it("F-01: com modal aberto, o Toaster vai para o topo (os botões do modal ficam embaixo)", () => {
    const app = read("client/src/App.tsx");
    expect(app).toMatch(/position=\{modalOpen \? "top-center" : "bottom-right"\}/);
    expect(read("client/src/erp/components/ui.tsx")).toContain("pushModal()");
  });

  it("F-02: Modal em portal, fundo inert, Tab preso e foco devolvido a quem abriu", () => {
    const ui = read("client/src/erp/components/ui.tsx");
    expect(ui).toContain("createPortal(");
    expect(ui).toMatch(/el\.inert = true/);
    expect(ui).toMatch(/event\.key !== "Tab"/);
    expect(ui).toMatch(/opener\.focus\(\)/);
  });

  it("F-03/F-04: alvos de 44px e coluna de ações fixa no celular", () => {
    const css = read("client/src/index.css");
    expect(css).toMatch(/\.app-shell \.topbar-icon, \.app-shell \.row-more, \.app-shell \.page-button[^{]*\{ min-width: 44px; min-height: 44px; \}/);
    expect(css).toMatch(/\.module-table \.row-actions-cell \{[^}]*position: sticky; right: 0;/);
    expect(read("client/src/erp/components/ModuleCrud.tsx")).toContain('<td className="row-actions-cell">');
    expect(read("client/src/erp/pages/UsuariosPage.tsx")).toContain('<td className="row-actions-cell">');
  });

  it("F-05: nenhum font-size abaixo de 12px no CSS; inputs com 16px no celular", () => {
    const css = read("client/src/index.css");
    const pequenos = [...css.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)].map(m => Number(m[1])).filter(n => n < 12);
    expect(pequenos).toEqual([]);
    expect(css).toMatch(/\.app-shell select, \.app-shell textarea,[^{]*\{ font-size: 16px; \}/);
  });

  it("F-06: viewport não bloqueia zoom", () => {
    expect(read("client/index.html")).not.toMatch(/maximum-scale|user-scalable=no/);
  });

  it("F-18 (média): senha inicial/nova senha do cadastro de usuário fica oculta (type=password) com Mostrar/Ocultar", () => {
    const src = read("client/src/erp/pages/UsuariosPage.tsx");
    expect(src).not.toMatch(/name="senha" type="text"/);
    expect(src).toContain('type={mostrarSenha ? "text" : "password"}');
    expect(src).toContain('"Mostrar senha"');
  });
});
