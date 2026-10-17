import { expect, test } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { E2E_DEMO_SENHA, login } from "./helpers";

const SENHA_INSPETORA = randomBytes(9).toString("base64url");
const SENHA_INATIVO = randomBytes(9).toString("base64url");

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
    await dialog.locator('input[name="senha"]').fill(SENHA_INSPETORA);
    await dialog.getByRole("button", { name: "Cadastrar usuário" }).click();
    await expect(page.getByTestId("user-row").filter({ hasText: email })).toBeVisible();
    await page.reload();
    await page.getByRole("textbox", { name: "Buscar usuário" }).fill(email);
    await expect(page.getByTestId("user-row").filter({ hasText: email })).toBeVisible();

    await page.context().clearCookies();
    await login(page, email, SENHA_INSPETORA);
    await page.goto("/qualidade");
    await expect(page.getByTestId("forbidden")).toHaveCount(0);
    await page.goto("/usuarios");
    await expect(page.getByTestId("forbidden")).toBeVisible();
  });

  test("N12: usuário inativo vê 'Usuário inativo' no login (não 'senha inválida')", async ({ page }) => {
    await login(page);
    await page.goto("/usuarios");
    await page.getByRole("button", { name: "Novo usuário" }).click();
    const dialog = page.getByRole("dialog");
    const email = `inativo-${Date.now()}@teste.local`;
    await dialog.locator('input[name="nome"]').fill("Inativo E2E");
    await dialog.locator('input[name="email"]').fill(email);
    await dialog.locator('input[name="matricula"]').fill(`I-${Date.now() % 100000}`);
    await dialog.locator('select[name="perfil"]').selectOption("Consulta");
    await dialog.locator('input[name="senha"]').fill(SENHA_INATIVO);
    await dialog.getByRole("button", { name: "Cadastrar usuário" }).click();
    const row = page.getByTestId("user-row").filter({ hasText: email });
    await row.getByRole("button", { name: "Ações de Inativo E2E" }).click();
    await page.getByRole("menuitem", { name: "Desativar" }).click();
    await expect(row).toContainText("Inativo");

    await page.context().clearCookies();
    await page.goto("/erp");
    await page.getByRole("textbox", { name: /E-mail/ }).fill(email);
    await page.getByLabel("Senha").fill(SENHA_INATIVO);
    await page.getByRole("button", { name: /Entrar/ }).click();
    await expect(page.getByText(/Usuário inativo\. Fale com o administrador/).first()).toBeVisible();
    await expect(page.getByText(/Usuário, e-mail, matrícula ou senha inválidos/)).toHaveCount(0);
  });
});
