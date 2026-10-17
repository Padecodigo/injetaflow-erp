import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("contextual ERP actions", () => {
  it("provides sector-specific forms instead of a generic order action", () => {
    const source = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");
    expect(source).toContain('"/usuarios": { title: "Novo usuário"');
    expect(source).toContain('"/qualidade": { title: "Novo ticket de qualidade"');
    expect(source).toContain('"/manutencao": { title: "Novo ticket de manutenção"');
    expect(source).toContain('"/ordens": { title: "Nova ordem de produção"');
    expect(source).toContain('"/estoque": { title: "Nova movimentação de estoque"');
    expect(source).toContain('"/meu-perfil": { title: "Novo apontamento pessoal"');
    expect(source).toContain('"/configuracoes": { title: "Nova regra operacional"');
    expect(source).toContain("NewActionModal");
    expect(source).toContain("setActionContext");
    expect(source).toContain("const target = context ??");
    expect(source).toContain("Identificação validada");
  });
});
