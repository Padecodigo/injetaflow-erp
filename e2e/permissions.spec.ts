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

  /**
   * B-23 (instável): o nome "Inativo E2E" já continha "Inativo", então `toContainText("Inativo")` passava antes
   * de a desativação gravar; o login seguinte entrava como usuário ATIVO e o teste esperava a mensagem até o
   * timeout; e, com muitos usuários, a linha nova nem aparecia na 1ª página. Agora: busca pelo e-mail, nome sem a palavra, espera a resposta da mutation e o status na coluna própria, e o login
   * roda num contexto novo (sem cookies nem storage do admin), sem depender da ordem da suíte.
   */
  test("N12: usuário inativo vê 'Usuário inativo' no login (não 'senha inválida')", async ({ page, browser }, testInfo) => {
    await login(page);
    await page.goto("/usuarios");
    await page.getByRole("button", { name: "Novo usuário" }).click();
    const dialog = page.getByRole("dialog");
    const marca = `${Date.now()}-${testInfo.repeatEachIndex}-${testInfo.retry}`;
    const email = `n12-${marca}@teste.local`;
    const nome = `Pessoa N12 ${marca}`;
    await dialog.locator('input[name="nome"]').fill(nome);
    await dialog.locator('input[name="email"]').fill(email);
    await dialog.locator('input[name="matricula"]').fill(`N12-${Date.now() % 100000}${testInfo.repeatEachIndex}`);
    await dialog.locator('select[name="perfil"]').selectOption("Consulta");
    await dialog.locator('input[name="senha"]').fill(SENHA_INATIVO);
    await dialog.getByRole("button", { name: "Cadastrar usuário" }).click();
    await expect(dialog).toBeHidden();
    // com muitos usuários (suíte inteira ou --repeat-each) a linha nova pode não estar na 1ª página: busca pelo e-mail
    await page.getByRole("textbox", { name: "Buscar usuário" }).fill(email);
    const row = page.getByTestId("user-row").filter({ hasText: email });
    await expect(row.locator("td").filter({ hasText: /^Ativo$/ })).toBeVisible();
    await row.getByRole("button", { name: `Ações de ${nome}` }).click();
    const gravou = page.waitForResponse(res => /\/api\/trpc\/usuarios\./.test(res.url()) && res.request().method() === "POST");
    await page.getByRole("menuitem", { name: "Desativar" }).click();
    expect((await gravou).ok()).toBe(true);
    await expect(row.locator("td").filter({ hasText: /^Inativo$/ })).toBeVisible();

    // login num contexto limpo: nada da sessão do admin (cookies, storage) vaza para cá
    const limpo = await browser.newContext({ baseURL: testInfo.project.use.baseURL, locale: "pt-BR", timezoneId: "America/Sao_Paulo", storageState: { cookies: [], origins: [] } });
    try {
      const tela = await limpo.newPage();
      await tela.goto("/erp");
      await tela.getByRole("textbox", { name: /E-mail/ }).fill(email);
      await tela.getByLabel("Senha").fill(SENHA_INATIVO);
      await tela.getByRole("button", { name: /Entrar/ }).click();
      await expect(tela.getByText(/Usuário inativo\. Fale com o administrador/).first()).toBeVisible();
      await expect(tela.getByText(/Usuário, e-mail, matrícula ou senha inválidos/)).toHaveCount(0);
      await expect(tela).toHaveURL(/\/erp(\?|$)/);
    } finally {
      await limpo.close();
    }
  });
});
