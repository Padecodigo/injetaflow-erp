import { expect, test } from "@playwright/test";
import { login, uniq } from "./helpers";

const pdf = (name: string) => ({ name, mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n% arquivo de teste E2E\n") });

test.describe("portal público", () => {
  test("B20: cotação é enviada ao servidor com anexo e aparece em Solicitações do ERP", async ({ page }) => {
    const tag = uniq();
    await page.goto("/cotacao");
    const form = page.getByRole("form", { name: "Formulário de cotação" });
    await form.locator('input[name="nome"]').fill(`Cliente Cotação ${tag}`);
    await form.locator('input[name="empresa"]').fill(`Empresa ${tag}`);
    await form.locator('input[name="email"]').fill(`cotacao-${tag.toLowerCase()}@teste.local`);
    await form.locator('input[name="anexo"]').setInputFiles(pdf("desenho.pdf"));
    await form.locator('input[name="consentimento"]').check();
    await form.getByRole("button", { name: /Enviar projeto para cotação/ }).click();
    await expect(page.getByTestId("envio-ok")).toContainText(/SOL-\d{4}/);

    await login(page);
    await page.goto("/solicitacoes");
    const section = page.getByRole("region", { name: "Solicitações do site" });
    await section.getByRole("textbox", { name: /^Buscar em/ }).fill(tag);
    const row = section.getByTestId("record-row").filter({ hasText: `Cliente Cotação ${tag}` });
    await expect(row).toContainText("Cotação");
    await expect(row).toContainText("desenho.pdf");
  });

  test("B19: contato tem formulário real e aviso de demonstração", async ({ page }) => {
    const tag = uniq();
    await page.goto("/contato");
    const contato = page.getByRole("form", { name: "Formulário de contato" });
    // Spec Segurança R4/R5: formulário ativo avisa que é ambiente de demonstração
    await expect(contato.getByTestId("aviso-demonstracao")).toHaveText(/Ambiente de demonstração: não envie dados pessoais nem arquivos reais\./);
    await contato.locator('input[name="nome"]').fill(`Contato ${tag}`);
    await contato.locator('input[name="email"]').fill(`contato-${tag.toLowerCase()}@teste.local`);
    await contato.locator('textarea[name="mensagem"]').fill("Quero falar sobre um projeto de tampas.");
    await contato.locator('input[name="consentimento"]').check();
    await contato.getByRole("button", { name: /Enviar mensagem/ }).click();
    await expect(page.getByTestId("envio-ok")).toBeVisible();

    await login(page);
    await page.goto("/solicitacoes");
    const section = page.getByRole("region", { name: "Solicitações do site" });
    await section.getByRole("textbox", { name: /^Buscar em/ }).fill(tag);
    await expect(section.getByTestId("record-row").filter({ hasText: `Contato ${tag}` })).toBeVisible();
  });

  test("Spec Segurança: cotação mostra o aviso de demonstração e continua ativa", async ({ page }) => {
    await page.goto("/cotacao");
    const form = page.getByRole("form", { name: "Formulário de cotação" });
    await expect(form.getByTestId("aviso-demonstracao")).toHaveText(/Ambiente de demonstração: não envie dados pessoais nem arquivos reais\./);
    await expect(form.getByRole("button", { name: /Enviar projeto para cotação/ })).toBeEnabled();
  });

  test("regressao R4/R5 curriculos portal desativado (UI + envio direto ao endpoint)", async ({ page }) => {
    await page.goto("/trabalhe-conosco");
    await expect(page.getByTestId("curriculos-desativados")).toHaveText("O envio de currículos está temporariamente desativado. Este é um ambiente de demonstração.");
    await expect(page.locator('input[type="file"]')).toHaveCount(0);
    await expect(page.getByRole("form", { name: "Enviar currículo" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Enviar para o RH/ })).toHaveCount(0);
    // a flag vem do servidor (config pública), padrão false
    const config = await page.request.get("/api/trpc/publico.config");
    expect((await config.json()).result.data.json).toEqual({ curriculosAtivo: false });
    // envio direto, sem UI: 403 e nada gravado
    const r = await page.request.post("/api/trpc/publico.enviarSolicitacao", {
      data: { json: { tipo: "Currículo", nome: "Candidata Fictícia", email: "cv-e2e@teste.local", area: "Qualidade", consentimento: true, anexo: { nome: "cv.pdf", base64: Buffer.from("%PDF-1.4").toString("base64") } } },
    });
    expect(r.status()).toBe(403);
    expect((await r.json()).error.json.message).toContain("temporariamente desativado");
    await login(page);
    await page.goto("/solicitacoes");
    const section = page.getByRole("region", { name: "Solicitações do site" });
    await section.getByRole("textbox", { name: /^Buscar em/ }).fill("cv-e2e@teste.local");
    await expect(section.getByTestId("record-row")).toHaveCount(0);
  });

  test("N06: telefone inválido mostra aviso visível junto ao campo (sem erro 'not focusable')", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", msg => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
    await page.goto("/contato");
    const form = page.getByRole("form", { name: "Formulário de contato" });
    await form.locator('input[name="nome"]').fill("Pessoa Demonstração");
    await form.locator('input[name="email"]').fill("n06@teste.local");
    await form.locator('textarea[name="mensagem"]').fill("Mensagem de teste N06.");
    await form.locator('input[name="telefone"]').fill("liga pra mim");
    await form.locator('input[name="consentimento"]').check();
    await form.getByRole("button", { name: /Enviar mensagem/ }).click();
    await expect(form.getByText(/Telefone inválido/)).toBeVisible();
    await expect(page.getByTestId("envio-ok")).toHaveCount(0);
    expect(consoleErrors.filter(e => /not focusable/i.test(e))).toEqual([]);
    await form.locator('input[name="telefone"]').fill("(12) 99999-0000");
    await form.getByRole("button", { name: /Enviar mensagem/ }).click();
    await expect(page.getByTestId("envio-ok")).toContainText(/SOL-\d{4}/);
  });

  test("B17: menu hambúrguer no celular; B18: rodapé leva às páginas órfãs", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page.getByRole("button", { name: "Abrir menu" }).click();
    await page.locator("#public-nav").getByRole("link", { name: "Quem somos" }).click();
    await expect(page).toHaveURL(/\/quem-somos$/);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.getByRole("navigation", { name: "Mapa do site" }).getByRole("link", { name: "Materiais e pigmentos" }).click();
    await expect(page).toHaveURL(/\/materiais-e-pigmentos$/);
    await page.getByRole("navigation", { name: "Mapa do site" }).getByRole("link", { name: "Qualidade" }).click();
    await expect(page).toHaveURL(/\/qualidade-institucional$/);
  });

  test("cards de serviço da home são clicáveis", async ({ page }) => {
    await page.goto("/");
    await page.locator(".portal-services").getByRole("link", { name: /Injeção plástica/ }).click();
    await expect(page).toHaveURL(/\/injecao-plastica$/);
  });
});
