import { randomBytes } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { E2E_ADMIN, login } from "./helpers";

const novaSenha = () => randomBytes(9).toString("base64url"); // gerada (nenhuma senha fixa no repo)

async function abrirMenu(page: Page, nomeOuEmail: string, nome: string) {
  const row = page.getByTestId("user-row").filter({ hasText: nomeOuEmail });
  await row.getByRole("button", { name: `Ações de ${nome}` }).click();
}

test.describe("P6-01: não administrador com 'Usuários: editar' não escala privilégio (tela)", () => {
  test("opção Administrador oculta, linha do admin protegida, próprio perfil/módulos travados, só concede o que possui", async ({ page }) => {
    const stamp = Date.now() % 100000;
    const email = `gestora.p6.${stamp}@teste.local`;
    const nome = `Gestora P6 ${stamp}`;
    const senha = novaSenha();

    // admin cria a gestora com Usuários: editar (cenário do aceite)
    await login(page);
    await page.goto("/usuarios");
    await page.getByRole("button", { name: "Novo usuário" }).click();
    let dialog = page.getByRole("dialog");
    await dialog.locator('input[name="nome"]').fill(nome);
    await dialog.locator('input[name="email"]').fill(email);
    await dialog.locator('input[name="matricula"]').fill(`GP6-${stamp}`);
    await dialog.locator('select[name="perfil"]').selectOption("Gestor");
    await dialog.getByLabel("Permissão Usuários e acessos").selectOption("editar");
    await dialog.locator('input[name="senha"]').fill(senha);
    await dialog.getByRole("button", { name: "Cadastrar usuário" }).click();
    await expect(page.getByTestId("user-row").filter({ hasText: email })).toBeVisible();

    // entra como a gestora
    await page.context().clearCookies();
    await login(page, email, senha);
    await page.goto("/usuarios");

    // linha do administrador: Editar / Desativar / Excluir desabilitados
    await abrirMenu(page, E2E_ADMIN.email, "Administrador Wamovale");
    for (const item of ["Editar", "Desativar", "Excluir"]) await expect(page.getByRole("menuitem", { name: item })).toBeDisabled();
    await page.keyboard.press("Escape");

    // novo usuário: sem opção Administrador; módulos que ela não tem ficam indisponíveis
    await page.getByRole("button", { name: "Novo usuário" }).click();
    dialog = page.getByRole("dialog");
    await expect(dialog.locator('select[name="perfil"] option', { hasText: "Administrador" })).toHaveCount(0);
    await expect(dialog.getByLabel("Permissão Configurações").locator('option[value="editar"]')).toHaveJSProperty("disabled", true);
    await expect(dialog.getByLabel("Permissão Financeiro").locator('option[value="editar"]')).toHaveJSProperty("disabled", true);
    await expect(dialog.getByLabel("Permissão Financeiro").locator('option[value="ver"]')).toHaveJSProperty("disabled", false);
    await dialog.getByRole("button", { name: "Cancelar" }).click();

    // a própria linha: perfil, status e módulos travados
    await abrirMenu(page, email, nome);
    await page.getByRole("menuitem", { name: "Editar" }).click();
    dialog = page.getByRole("dialog");
    await expect(dialog.locator('select[name="perfil"]')).toBeDisabled();
    await expect(dialog.locator('select[name="status"]')).toBeDisabled();
    await expect(dialog.getByLabel("Permissão Configurações")).toBeDisabled();
    await expect(dialog.getByText("Você não altera o próprio perfil, módulos ou status.")).toBeVisible();
  });
});

test.describe("P6-03: troca de senha com mensagens próprias em português", () => {
  test("campos vazios e senha curta mostram mensagens em português, um aviso por vez", async ({ page }) => {
    await login(page);
    await page.goto("/meu-perfil");
    const form = page.getByRole("form", { name: "Alterar senha" });
    await form.getByRole("button", { name: "Salvar nova senha" }).click();
    await expect(form.getByText("Informe a senha atual.")).toBeVisible();
    await expect(form.getByText("Informe a nova senha.")).toBeVisible();
    await expect(form.getByText("Confirme a nova senha.")).toBeVisible();
    await form.locator('input[name="atual"]').fill("qualquer");
    await form.locator('input[name="nova"]').fill("123");
    await form.locator('input[name="confirma"]').fill("123");
    await form.getByRole("button", { name: "Salvar nova senha" }).click();
    await expect(form.getByText("Nova senha: mínimo de 6 caracteres.")).toBeVisible();
    await form.locator('input[name="confirma"]').fill("1234");
    await form.getByRole("button", { name: "Salvar nova senha" }).click();
    await expect(page.locator("[data-sonner-toast]")).toHaveCount(1);
    await expect(page.locator("body")).not.toContainText(/Please fill|Invalid input|expected string/);
  });
});
