import { expect, test } from "@playwright/test";
import { E2E_ADMIN, login } from "./helpers";

test.describe("sessão e guarda de rotas", () => {
  test("B01/B04: rota privada sem sessão redireciona para o login e volta depois", async ({ page }) => {
    await page.goto("/financeiro");
    await expect(page).toHaveURL(/\/erp\?next=%2Ffinanceiro/);
    await page.getByRole("textbox", { name: /E-mail/ }).fill(E2E_ADMIN.email);
    await page.getByLabel("Senha").fill(E2E_ADMIN.senha);
    await page.getByRole("button", { name: /Entrar/ }).click();
    await expect(page).toHaveURL(/\/financeiro$/);
  });

  test("B12: tela de login não mostra credenciais e senha errada dá erro", async ({ page }) => {
    await page.goto("/erp");
    await expect(page.locator("body")).not.toContainText("adm123");
    await expect(page.locator("body")).not.toContainText(E2E_ADMIN.senha);
    await page.getByRole("textbox", { name: /E-mail/ }).fill(E2E_ADMIN.email);
    await page.getByLabel("Senha").fill("senha-errada-123");
    await page.getByRole("button", { name: /Entrar/ }).click();
    await expect(page.locator(".erp-form-error")).toContainText(/E-mail ou senha inválidos/);
    await expect(page).toHaveURL(/\/erp/);
  });

  test("B02/B03: sessão sobrevive ao F5 e Sair encerra de verdade", async ({ page }) => {
    await login(page);
    await page.goto("/dashboard");
    await page.reload();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await page.goto("/meu-perfil");
    await page.getByRole("main").getByRole("button", { name: "Sair", exact: true }).click();
    await expect(page).toHaveURL(/\/erp/);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/erp\?next=/);
  });

  test("B16: rota desconhecida mostra 404 real", async ({ page }) => {
    const response = await page.goto("/rota-que-nao-existe");
    expect(response?.status()).toBe(404);
    await expect(page.getByTestId("not-found")).toContainText("Página não encontrada");
  });
});
