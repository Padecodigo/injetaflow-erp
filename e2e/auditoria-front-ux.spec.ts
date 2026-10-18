import { expect, test, type Page } from "@playwright/test";
import { login, uniq } from "./helpers";

/**
 * Regressões da auditoria de frontend (312ddd2), achados altos F-01..F-06.
 * Adaptado de auditoria-front/testes-propostos (aceite-front-toast-e-modal e aceite-front-mobile).
 */

/** F-01: nada (toast ou outro elemento) pode cobrir o botão principal do modal. */
async function botaoLivre(page: Page, nome: string) {
  const btn = page.getByRole("dialog").getByRole("button", { name: nome, exact: false }).last();
  await btn.scrollIntoViewIfNeeded();
  const b = (await btn.boundingBox())!;
  const topo = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest("button")?.textContent?.trim() ?? null, [b.x + b.width / 2, b.y + b.height / 2]);
  expect(topo, "o centro do botão deve receber o clique").toContain(nome);
  for (const t of await page.locator("[data-sonner-toast]").all()) {
    const r = await t.boundingBox();
    if (!r) continue;
    const sobrepoe = r.x < b.x + b.width && r.x + r.width > b.x && r.y < b.y + b.height && r.y + r.height > b.y;
    expect(sobrepoe, "toast sobre o botão").toBe(false);
  }
}

test.describe("F-01: aviso não cobre o botão de ação do modal", () => {
  for (const vp of [{ width: 1280, height: 720 }, { width: 768, height: 1024 }, { width: 390, height: 844 }, { width: 360, height: 640 }]) {
    test(`F-01: erro ao cadastrar usuário não cobre "Cadastrar usuário" em ${vp.width}x${vp.height}`, async ({ page }) => {
      await page.setViewportSize(vp);
      await login(page);
      await page.goto("/usuarios");
      await page.getByRole("button", { name: "Novo usuário" }).click();
      const d = page.getByRole("dialog");
      await d.locator('[name="nome"]').fill("Teste Toast");
      await d.locator('[name="email"]').fill("admin@wamovale.local"); // e-mail já usado → erro do servidor
      await d.locator('[name="matricula"]').fill(`TST-${uniq()}`);
      await d.locator('[name="senha"]').fill(`prov-${uniq()}-${uniq()}`);
      await d.getByRole("button", { name: "Cadastrar usuário" }).click();
      // o erro aparece no modal (role=alert), junto aos botões
      await expect(d.locator(".erp-form-error")).toContainText("Não foi possível salvar");
      await botaoLivre(page, "Cadastrar usuário");
    });
  }

  test("F-01/F-08: no celular, a validação não cobre o Salvar e o resumo é curto", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await login(page);
    await page.goto("/ordens");
    await page.getByRole("button", { name: "Nova ordem" }).first().click();
    const d = page.getByRole("dialog");
    await d.getByRole("button", { name: /^Salvar/ }).click();
    await expect(d.locator(".erp-form-error")).toHaveText(/\d+ campos? para conferir\./);
    await expect(page.locator("[data-sonner-toast]")).toHaveCount(0);
    await botaoLivre(page, "Salvar");
  });
});

test("F-02: modal prende o foco, deixa o fundo inerte e devolve o foco ao botão que o abriu", async ({ page }) => {
  await login(page);
  await page.goto("/ordens");
  const abrir = page.getByRole("button", { name: "Nova ordem" }).first();
  await abrir.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(await page.evaluate(() => (document.getElementById("root") as HTMLElement & { inert: boolean }).inert), "fundo inerte").toBe(true);
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => !!document.activeElement?.closest("[role=dialog]")), `Tab ${i + 1} saiu do modal`).toBe(true);
  }
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press("Shift+Tab");
    expect(await page.evaluate(() => !!document.activeElement?.closest("[role=dialog]")), `Shift+Tab ${i + 1} saiu do modal`).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(abrir).toBeFocused();
  expect(await page.evaluate(() => (document.getElementById("root") as HTMLElement & { inert: boolean }).inert)).toBe(false);
});

test.describe("F-03/F-04/F-05/F-06: ERP no celular", () => {
  for (const vp of [{ width: 360, height: 740 }, { width: 390, height: 844 }]) {
    test.describe(`${vp.width}px`, () => {
      test.use({ viewport: vp });

      test("F-03: alvos de toque principais têm pelo menos 44x44", async ({ page }) => {
        await login(page);
        await page.goto("/ordens");
        await expect(page.getByRole("button", { name: /^Ações de/ }).first()).toBeVisible();
        const alvos = [
          page.getByRole("button", { name: "Abrir menu" }),
          page.getByRole("button", { name: /^Notificações/ }),
          page.getByRole("button", { name: /^Ações de/ }).first(),
          page.getByRole("button", { name: "Página 1" }),
        ];
        for (const alvo of alvos) {
          const b = (await alvo.boundingBox())!;
          expect(Math.min(b.width, b.height), (await alvo.getAttribute("aria-label")) ?? "").toBeGreaterThanOrEqual(44);
        }
        await page.getByRole("button", { name: "Abrir menu" }).click();
        const fechar = (await page.locator(".mobile-close").boundingBox())!;
        expect(Math.min(fechar.width, fechar.height)).toBeGreaterThanOrEqual(44);
      });

      test("F-04: as ações de cada registro ficam visíveis sem rolar a tabela para o lado", async ({ page }) => {
        await login(page);
        for (const route of ["/ordens", "/estoque", "/qualidade", "/usuarios"]) {
          await page.goto(route);
          const acao = page.getByRole("button", { name: /^Ações de/ }).first();
          await expect(acao).toBeVisible();
          // rola só a página (verticalmente) até a linha; a tabela não é rolada para o lado
          await acao.evaluate(el => { const r = el.getBoundingClientRect(); window.scrollBy(0, r.top - window.innerHeight / 2); });
          expect(await acao.evaluate(el => el.closest(".module-table-wrap")?.scrollLeft ?? 0), `${route}: tabela não rolada`).toBe(0);
          const b = (await acao.boundingBox())!;
          expect(b.x + b.width, `${route}: botão de ações fora da tela`).toBeLessThanOrEqual(vp.width);
          expect(b.x, `${route}: botão de ações fora da tela`).toBeGreaterThanOrEqual(0);
          // o botão recebe o toque (não está coberto por outra célula)
          const topo = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest("button")?.getAttribute("aria-label") ?? null, [b.x + b.width / 2, b.y + b.height / 2]);
          expect(topo, route).toMatch(/^Ações de/);
          await acao.click();
          await expect(page.getByRole("menuitem").first()).toBeVisible();
          await page.keyboard.press("Escape");
          // a página continua sem rolagem lateral
          expect(await page.evaluate(() => document.documentElement.scrollWidth), route).toBeLessThanOrEqual(vp.width);
        }
      });

      test("F-05/F-06: texto do ERP com no mínimo 12px, inputs com 16px e zoom permitido", async ({ page }) => {
        await login(page);
        for (const route of ["/dashboard", "/ordens"]) {
          await page.goto(route);
          await page.waitForLoadState("networkidle");
          const pequenos = await page.evaluate(() => [...document.querySelectorAll(".app-shell *")]
            .filter(e => e.children.length === 0 && (e.textContent ?? "").trim() && !e.closest(".sr-only") && (e as HTMLElement).offsetParent !== null)
            .filter(e => parseFloat(getComputedStyle(e).fontSize) < 12).map(e => `${(e.textContent ?? "").trim().slice(0, 30)} (${getComputedStyle(e).fontSize})`));
          expect(pequenos, `${route}: textos abaixo de 12px`).toEqual([]);
        }
        await page.getByRole("button", { name: "Nova ordem" }).first().click();
        const fontes = await page.getByRole("dialog").locator("input:not([type=checkbox]):not([type=radio]), select").evaluateAll(els => els.map(e => parseFloat(getComputedStyle(e).fontSize)));
        expect(Math.min(...fontes), "inputs do formulário com 16px no celular").toBeGreaterThanOrEqual(16);
        const viewport = await page.locator('meta[name="viewport"]').getAttribute("content");
        expect(viewport).not.toMatch(/maximum-scale|user-scalable=no/);
      });
    });
  }
});

test("F-18 (média): senha do cadastro de usuário fica oculta, com Mostrar/Ocultar", async ({ page }) => {
  await login(page);
  await page.goto("/usuarios");
  await page.getByRole("button", { name: "Novo usuário" }).click();
  const d = page.getByRole("dialog");
  const senha = d.locator('input[name="senha"]');
  await expect(senha).toHaveAttribute("type", "password");
  await d.getByRole("button", { name: "Mostrar senha" }).click();
  await expect(senha).toHaveAttribute("type", "text");
  await d.getByRole("button", { name: "Ocultar senha" }).click();
  await expect(senha).toHaveAttribute("type", "password");
});
