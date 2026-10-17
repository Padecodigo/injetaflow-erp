import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test.describe("N08: ERP no celular (390px)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("N08: nenhuma página do ERP tem rolagem lateral; tabelas rolam dentro do card", async ({ page }) => {
    await login(page);
    for (const route of ["/dashboard", "/estoque", "/ordens", "/rh", "/usuarios", "/producao", "/qualidade", "/moldes", "/manutencao", "/financeiro", "/solicitacoes", "/configuracoes", "/meu-perfil"]) {
      await page.goto(route);
      await expect(page.locator("main h1").first()).toBeVisible();
      await page.waitForLoadState("networkidle");
      const sw = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(sw, `${route} scrollWidth`).toBeLessThanOrEqual(390);
    }
  });

  test("N08: Exportar CSV, Nova movimentação e Registrar ponto ficam visíveis e funcionam", async ({ page }) => {
    await login(page);
    await page.goto("/estoque");
    const header = page.locator(".page-header");
    for (const name of ["Nova movimentação", "Exportar CSV"]) {
      const button = header.getByRole("button", { name });
      await expect(button, name).toBeVisible();
      expect((await button.boundingBox())!.width, name).toBeGreaterThan(40);
    }
    await page.goto("/ordens");
    await expect(page.locator(".page-header").getByRole("button", { name: "Exportar CSV" })).toBeVisible();
    await page.goto("/rh");
    const ponto = page.locator(".page-header").getByRole("button", { name: "Registrar ponto" });
    await expect(ponto).toBeVisible();
    await ponto.click();
    await expect(page.getByRole("dialog", { name: /Registrar ponto/ })).toBeVisible();
  });

  test("N08: o aviso (toast) não cobre a barra superior", async ({ page }) => {
    await login(page);
    await page.goto("/ordens");
    const download = page.waitForEvent("download").catch(() => null);
    await page.locator(".page-header").getByRole("button", { name: "Exportar CSV" }).click();
    await download;
    const toast = page.locator("[data-sonner-toast]").first();
    await expect(toast).toBeVisible();
    const t = (await toast.boundingBox())!;
    const bar = (await page.locator(".topbar").first().boundingBox())!;
    expect(t.y, "toast abaixo da topbar").toBeGreaterThanOrEqual(bar.y + bar.height);
  });
});

test("N08: em desktop a tabela de Usuários cabe no card e a coluna Usuário fica visível", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await login(page);
  await page.goto("/usuarios");
  const wrap = page.locator(".module-table-wrap").first();
  await expect(wrap.getByTestId("user-row").first()).toBeVisible();
  const { sw, cw } = await wrap.evaluate(el => ({ sw: el.scrollWidth, cw: el.clientWidth }));
  expect(sw).toBeLessThanOrEqual(cw + 1);
  await expect(wrap.getByRole("columnheader", { name: "Usuário" })).toBeInViewport();
});
