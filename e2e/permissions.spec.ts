import { expect, test } from "@playwright/test";
import { E2E_DEMO_SENHA, login } from "./helpers";

test.describe("B10/B24: permissões por perfil", () => {
  test("operador vê só os módulos liberados; o resto mostra 403", async ({ page }) => {
    await login(page, "operador.demo@wamovale.local", E2E_DEMO_SENHA);
    for (const route of ["/usuarios", "/financeiro", "/configuracoes"]) {
      await page.goto(route);
      await expect(page.getByTestId("forbidden"), route).toBeVisible();
    }
    await page.goto("/producao");
    await expect(page.getByTestId("forbidden")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Produção" }).first()).toBeVisible();
  });

  test("administrador cria usuário com módulos e ele entra só nesses módulos", async ({ page }) => {
    await login(page);
    await page.goto("/usuarios");
    await page.getByRole("button", { name: "Novo usuário" }).click();
    const dialog = page.getByRole("dialog");
    const email = `qualidade-${Date.now()}@teste.local`;
    await dialog.locator('input[name="nome"]').fill("Inspetora E2E");
    await dialog.locator('input[name="email"]').fill(email);
    await dialog.locator('input[name="matricula"]').fill(`Q-${Date.now() % 100000}`);
    await dialog.locator('select[name="setor"]').selectOption("Qualidade");
    await dialog.locator('select[name="perfil"]').selectOption("Consulta");
    await dialog.getByLabel("Permissão Qualidade").selectOption("editar");
    await dialog.locator('input[name="senha"]').fill("Senha-Inspetora-1");
    await dialog.getByRole("button", { name: "Cadastrar usuário" }).click();
    await expect(page.getByTestId("user-row").filter({ hasText: email })).toBeVisible();
    await page.reload();
    await page.getByRole("textbox", { name: "Buscar usuário" }).fill(email);
    await expect(page.getByTestId("user-row").filter({ hasText: email })).toBeVisible();

    await page.context().clearCookies();
    await login(page, email, "Senha-Inspetora-1");
    await page.goto("/qualidade");
    await expect(page.getByTestId("forbidden")).toHaveCount(0);
    await page.goto("/usuarios");
    await expect(page.getByTestId("forbidden")).toBeVisible();
  });
});
