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

async function criarComoAdmin(page: Page, dados: { nome: string; email: string; matricula: string; perfil: string; extras?: Record<string, "ver" | "editar">; senha: string }) {
  await page.goto("/usuarios");
  await page.getByRole("button", { name: "Novo usuário" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator('input[name="nome"]').fill(dados.nome);
  await dialog.locator('input[name="email"]').fill(dados.email);
  await dialog.locator('input[name="matricula"]').fill(dados.matricula);
  await dialog.locator('select[name="perfil"]').selectOption(dados.perfil);
  for (const [label, nivel] of Object.entries(dados.extras ?? {})) await dialog.getByLabel(`Permissão ${label}`).selectOption(nivel);
  await dialog.locator('input[name="senha"]').fill(dados.senha);
  await dialog.getByRole("button", { name: "Cadastrar usuário" }).click();
  await expect(page.getByTestId("user-row").filter({ hasText: dados.email })).toBeVisible();
}

test.describe("R-01: não administrador não assume a conta de quem tem mais acesso (tela)", () => {
  test("credenciais e status de quem excede a gestora ficam travados; de quem está dentro do acesso dela, liberados", async ({ page }) => {
    const stamp = Date.now() % 100000;
    const gestora = { nome: `Gestora R01 ${stamp}`, email: `gestora.r01.${stamp}@teste.local`, matricula: `GR1-${stamp}`, perfil: "Gestor", extras: { "Usuários e acessos": "editar" as const }, senha: novaSenha() };
    const superior = { nome: `Superior R01 ${stamp}`, email: `superior.r01.${stamp}@teste.local`, matricula: `SR1-${stamp}`, perfil: "Gestor", extras: { Financeiro: "editar" as const }, senha: novaSenha() };
    const subordinado = { nome: `Subordinado R01 ${stamp}`, email: `sub.r01.${stamp}@teste.local`, matricula: `UR1-${stamp}`, perfil: "Operador", senha: novaSenha() };
    await login(page);
    for (const u of [gestora, superior, subordinado]) await criarComoAdmin(page, u);

    await page.context().clearCookies();
    await login(page, gestora.email, gestora.senha);
    await page.goto("/usuarios");
    await page.getByRole("searchbox", { name: "Buscar usuário" }).or(page.getByLabel("Buscar usuário")).fill(`R01 ${stamp}`);

    // superior: Desativar/Excluir desabilitados; no Editar, senha/e-mail/usuário/status travados com aviso
    await abrirMenu(page, superior.email, superior.nome);
    await expect(page.getByRole("menuitem", { name: "Desativar" })).toBeDisabled();
    await expect(page.getByRole("menuitem", { name: "Excluir" })).toBeDisabled();
    await page.getByRole("menuitem", { name: "Editar" }).click();
    let dialog = page.getByRole("dialog");
    await expect(dialog.getByTestId("credenciais-travadas")).toContainText("Financeiro");
    for (const campo of ['input[name="email"]', 'input[name="username"]', 'input[name="senha"]', 'select[name="status"]']) await expect(dialog.locator(campo), campo).toBeDisabled();
    await expect(dialog.getByRole("button", { name: "Gerar" })).toBeDisabled();
    // B-01 (auditoria back): nem dados "não sensíveis" de quem tem mais acesso; o botão de salvar fica desabilitado
    await expect(dialog.getByTestId("credenciais-travadas")).toContainText("Somente o administrador pode alterar ou excluir");
    await expect(dialog.getByRole("button", { name: "Salvar alterações" })).toBeDisabled();
    await dialog.getByRole("button", { name: "Cancelar" }).click();

    // subordinado (dentro do acesso da gestora): tudo liberado
    await abrirMenu(page, subordinado.email, subordinado.nome);
    await expect(page.getByRole("menuitem", { name: "Desativar" })).toBeEnabled();
    await expect(page.getByRole("menuitem", { name: "Excluir" })).toBeEnabled();
    await page.getByRole("menuitem", { name: "Editar" }).click();
    dialog = page.getByRole("dialog");
    await expect(dialog.getByTestId("credenciais-travadas")).toHaveCount(0);
    await expect(dialog.locator('input[name="senha"]')).toBeEnabled();
    await expect(dialog.locator('input[name="email"]')).toBeEnabled();
  });

  test("R-03: no modal de Usuários, o aviso de erro anterior some ao mostrar o novo", async ({ page }) => {
    await login(page);
    await page.goto("/usuarios");
    await page.getByRole("button", { name: "Novo usuário" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator('input[name="nome"]').fill("Pessoa Duplicada");
    await dialog.locator('input[name="email"]').fill(E2E_ADMIN.email);
    await dialog.locator('input[name="matricula"]').fill(`DUP-${Date.now() % 100000}`);
    await dialog.locator('input[name="senha"]').fill(novaSenha());
    for (let i = 0; i < 3; i++) {
      // envia com Enter: o próprio aviso pode cobrir o botão em telas baixas
      await dialog.locator('input[name="nome"]').press("Enter");
      // B-08 (auditoria back): mensagem neutra, igual para e-mail desta empresa ou de outra
      await expect(dialog.getByRole("alert")).toContainText("Este e-mail não pode ser usado");
    }
    await expect(page.locator("[data-sonner-toast]")).toHaveCount(1);
  });
});
