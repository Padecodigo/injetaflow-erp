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

  test("B19: contato tem formulário real; B21: currículo vai com arquivo para o RH", async ({ page }) => {
    const tag = uniq();
    await page.goto("/contato");
    const contato = page.getByRole("form", { name: "Formulário de contato" });
    await contato.locator('input[name="nome"]').fill(`Contato ${tag}`);
    await contato.locator('input[name="email"]').fill(`contato-${tag.toLowerCase()}@teste.local`);
    await contato.locator('textarea[name="mensagem"]').fill("Quero falar sobre um projeto de tampas.");
    await contato.locator('input[name="consentimento"]').check();
    await contato.getByRole("button", { name: /Enviar mensagem/ }).click();
    await expect(page.getByTestId("envio-ok")).toBeVisible();

    await page.goto("/trabalhe-conosco");
    const cv = page.getByRole("form", { name: "Enviar currículo" });
    await cv.locator('input[name="nome"]').fill(`Candidata ${tag}`);
    await cv.locator('input[name="email"]').fill(`cv-${tag.toLowerCase()}@teste.local`);
    await cv.locator('select[name="area"]').selectOption({ index: 1 });
    await cv.locator('input[name="curriculo"]').setInputFiles(pdf("curriculo.pdf"));
    await cv.locator('input[name="consentimento"]').check();
    await cv.getByRole("button", { name: /Enviar para o RH/ }).click();
    await expect(page.getByTestId("envio-ok")).toBeVisible();

    await login(page);
    await page.goto("/solicitacoes");
    const section = page.getByRole("region", { name: "Solicitações do site" });
    await section.getByRole("textbox", { name: /^Buscar em/ }).fill(tag);
    await expect(section.getByTestId("record-row").filter({ hasText: `Contato ${tag}` })).toBeVisible();
    await expect(section.getByTestId("record-row").filter({ hasText: `Candidata ${tag}` })).toContainText("curriculo.pdf");
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
