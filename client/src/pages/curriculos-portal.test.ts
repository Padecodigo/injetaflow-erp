import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";

/**
 * Spec Segurança LGPD (R4/R5): componente "Trabalhe conosco" controlado pela flag do servidor
 * (PORTAL_CURRICULOS_ATIVO, lida pela config pública trpc.publico.config). Renderização real do componente.
 */
const flag = vi.hoisted(() => ({ value: undefined as boolean | undefined }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    publico: {
      config: { useQuery: () => ({ data: flag.value === undefined ? undefined : { curriculosAtivo: flag.value }, isLoading: flag.value === undefined }) },
      enviarSolicitacao: { useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }) },
    },
  },
}));

const { CareersPage, AVISO_DEMONSTRACAO, CURRICULOS_DESATIVADOS } = await import("./Home");
const render = () => renderToStaticMarkup(createElement(Router, { ssrPath: "/trabalhe-conosco" }, createElement(CareersPage)));

describe("Spec Segurança: Trabalhe conosco com envio de currículo controlado pelo servidor", () => {
  beforeEach(() => { flag.value = undefined; });

  it("flag false: sem input de arquivo, sem botão de envio habilitado, aviso visível", () => {
    flag.value = false;
    const html = render();
    expect(html).toContain(CURRICULOS_DESATIVADOS);
    expect(html).toContain('data-testid="curriculos-desativados"');
    expect(html).not.toMatch(/type="file"/);
    expect(html).not.toMatch(/<button[^>]*type="submit"(?![^>]*disabled)/);
    expect(html).not.toMatch(/<form[^>]*Enviar currículo/);
    // não convida a mandar currículo por outros canais enquanto estiver desligado
    expect(html).not.toContain("mailto:");
    expect(html).not.toContain("QR Code");
  });

  it("config ainda carregando (ou indisponível): fica desligado por padrão", () => {
    flag.value = undefined;
    const html = render();
    expect(html).toContain(CURRICULOS_DESATIVADOS);
    expect(html).not.toMatch(/type="file"/);
  });

  it("flag true (só em teste): renderiza o formulário normalmente, com o aviso de demonstração", () => {
    flag.value = true;
    const html = render();
    expect(html).toMatch(/<input[^>]*type="file"[^>]*name="curriculo"/);
    expect(html).toMatch(/<button[^>]*type="submit"/);
    expect(html).toContain(AVISO_DEMONSTRACAO);
    expect(html).not.toContain(CURRICULOS_DESATIVADOS);
  });

  it("nenhum dado pessoal vai para console ou localStorage no fluxo do portal", () => {
    const src = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");
    expect(src).not.toMatch(/console\.(log|info|debug|warn|error)/);
    expect(src).not.toMatch(/localStorage|sessionStorage/);
    // os toasts do envio só mostram protocolo/mensagem do servidor, nunca nome, e-mail ou telefone digitados
    for (const m of src.matchAll(/toast\.(?:success|error)\(([^;]*)\);/g)) expect(m[1]).not.toMatch(/text\(form, "(nome|email|telefone)"\)/);
  });
});

describe("Spec Segurança: aviso de demonstração nos formulários públicos ativos", () => {
  it("cotação e contato mostram o aviso e continuam ativos", () => {
    const src = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");
    expect(AVISO_DEMONSTRACAO).toBe("Ambiente de demonstração: não envie dados pessoais nem arquivos reais.");
    for (const form of ['aria-label="Formulário de cotação"', 'aria-label="Formulário de contato"']) {
      const at = src.indexOf(form);
      expect(at, form).toBeGreaterThan(-1);
      expect(src.slice(at, at + 200), form).toContain("<DemoNotice />");
    }
  });
});
