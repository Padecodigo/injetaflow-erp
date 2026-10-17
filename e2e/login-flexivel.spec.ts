import { randomBytes } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { E2E_ADMIN, E2E_DEMO_SENHA, login } from "./helpers";

const novaSenha = () => randomBytes(6).toString("base64url"); // gerada (nenhuma senha fixa no repo)

async function entrar(page: Page, identificador: string, senha: string) {
  await page.goto("/erp");
  await page.getByRole("textbox", { name: "E-mail, usuário ou matrícula" }).fill(identificador);
  await page.getByLabel("Senha").fill(senha);
  await page.getByRole("button", { name: /Entrar/ }).click();
}

test.describe("login flexível", () => {
  test("campo único aceita e-mail, nome de usuário e matrícula (maiúsculas não importam)", async ({ page }) => {
    for (const identificador of [E2E_ADMIN.email, "admin", "ADMIN", E2E_ADMIN.matricula, E2E_ADMIN.matricula.toLowerCase()]) {
      await page.context().clearCookies();
      await entrar(page, identificador, E2E_ADMIN.senha!);
      await expect(page, identificador).not.toHaveURL(/\/erp(\?|$)/);
      await expect(page.locator("main h1").first()).toBeVisible();
    }
  });

  test("identificador ou senha errados mostram mensagem genérica", async ({ page }) => {
    await entrar(page, "admin", "senha-errada");
    await expect(page.locator(".erp-form-error")).toContainText("Usuário, e-mail, matrícula ou senha inválidos.");
    await entrar(page, "ninguem-aqui", "senha-errada");
    await expect(page.locator(".erp-form-error")).toContainText("Usuário, e-mail, matrícula ou senha inválidos.");
  });
});

test.describe("Meu perfil: nome de usuário e senha; matrícula só leitura", () => {
  test("usuário troca o nome de usuário e a senha (exige a atual) e entra com os novos dados", async ({ page }) => {
    await login(page, "consulta.demo@wamovale.local", E2E_DEMO_SENHA);
    await page.goto("/meu-perfil");
    const conta = page.getByRole("form", { name: "Minha conta" });
    const matricula = conta.locator('input[name="matricula"]');
    await expect(matricula).toHaveValue("DEMO-CON");
    await expect(matricula).not.toBeEditable();
    await expect(conta.locator('input[name="perfil"]')).not.toBeEditable();

    // unicidade
    await conta.locator('input[name="username"]').fill("admin");
    await conta.getByRole("button", { name: "Salvar nome de usuário" }).click();
    await expect(conta.getByRole("alert")).toContainText("já está em uso");
    // formato
    await conta.locator('input[name="username"]').fill("com espaço");
    await conta.getByRole("button", { name: "Salvar nome de usuário" }).click();
    await expect(conta.getByRole("alert")).toContainText("Nome de usuário");
    // ok
    await conta.locator('input[name="username"]').fill("consulta.e2e");
    await conta.getByRole("button", { name: "Salvar nome de usuário" }).click();
    await expect(page.getByText("Nome de usuário atualizado")).toBeVisible();

    // troca de senha: atual errada é recusada; curta é recusada; certa funciona
    const senha = page.getByRole("region", { name: "Alterar senha" });
    const nova = novaSenha();
    await senha.getByLabel("Senha atual").fill("errada-123");
    await senha.getByLabel(/Nova senha/).fill(nova);
    await senha.getByLabel("Confirmar nova senha").fill(nova);
    await senha.getByRole("button", { name: "Salvar nova senha" }).click();
    await expect(page.getByText("Senha atual incorreta.")).toBeVisible();
    await senha.getByLabel("Senha atual").fill(E2E_DEMO_SENHA!);
    await senha.getByRole("button", { name: "Salvar nova senha" }).click();
    await expect(page.getByText("Senha alterada")).toBeVisible();

    await page.context().clearCookies();
    await entrar(page, "Consulta.E2E", nova);
    await expect(page).not.toHaveURL(/\/erp(\?|$)/);
    await page.context().clearCookies();
    await entrar(page, "demo-con", nova);
    await expect(page).not.toHaveURL(/\/erp(\?|$)/);
  });

  test("administrador altera matrícula e nome de usuário em Usuários e a pessoa entra com a nova matrícula", async ({ page }) => {
    await login(page);
    await page.goto("/usuarios");
    await page.getByRole("button", { name: "Novo usuário" }).click();
    const dialog = page.getByRole("dialog");
    const stamp = Date.now() % 100000;
    const senha = novaSenha();
    await dialog.locator('input[name="nome"]').fill("Pessoa Matrícula E2E");
    await dialog.locator('input[name="email"]').fill(`mat-${stamp}@teste.local`);
    await dialog.locator('input[name="matricula"]').fill(`M-${stamp}`);
    await dialog.locator('select[name="perfil"]').selectOption("Consulta");
    await dialog.locator('input[name="senha"]').fill(senha);
    await dialog.getByRole("button", { name: "Cadastrar usuário" }).click();
    const row = page.getByTestId("user-row").filter({ hasText: `mat-${stamp}@teste.local` });
    await expect(row).toContainText(`@mat-${stamp}`); // username derivado do e-mail

    await row.getByRole("button", { name: "Ações de Pessoa Matrícula E2E" }).click();
    await page.getByRole("menuitem", { name: "Editar" }).click();
    const edit = page.getByRole("dialog");
    await expect(edit.locator('input[name="matricula"]')).toBeEditable();
    await edit.locator('input[name="matricula"]').fill(`N-${stamp}`);
    await edit.locator('input[name="username"]').fill(`pessoa${stamp}`);
    await edit.getByRole("button", { name: "Salvar alterações" }).click();
    await expect(row).toContainText(`N-${stamp}`);
    await expect(row).toContainText(`@pessoa${stamp}`);

    await page.context().clearCookies();
    await entrar(page, `n-${stamp}`, senha);
    await expect(page).not.toHaveURL(/\/erp(\?|$)/);
    await page.context().clearCookies();
    await entrar(page, `PESSOA${stamp}`, senha);
    await expect(page).not.toHaveURL(/\/erp(\?|$)/);
  });
});
