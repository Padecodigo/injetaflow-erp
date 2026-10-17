import { expect, type Locator, type Page } from "@playwright/test";
import { E2E_ADMIN, E2E_DEMO_SENHA } from "../playwright.config";

export { E2E_ADMIN, E2E_DEMO_SENHA };

export async function login(page: Page, email = E2E_ADMIN.email, senha = E2E_ADMIN.senha) {
  await page.goto("/erp");
  await page.getByRole("textbox", { name: /E-mail/ }).fill(email);
  await page.getByLabel("Senha").fill(senha);
  await page.getByRole("button", { name: /Entrar/ }).click();
  await expect(page).not.toHaveURL(/\/erp(\?|$)/);
}

export function uniq() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type Override = string | RegExp;

/**
 * Preenche todos os campos do formulário aberto a partir dos atributos HTML
 * (texto, número, data, select). Overrides: valor exato ou RegExp para escolher a opção do select.
 */
export async function fillRecordForm(dialog: Locator, tag: string, overrides: Record<string, Override> = {}) {
  const controls = dialog.locator("form [name]");
  const count = await controls.count();
  const filled: Record<string, string> = {};
  for (let i = 0; i < count; i++) {
    const control = controls.nth(i);
    const name = (await control.getAttribute("name"))!;
    const tagName = await control.evaluate(el => el.tagName.toLowerCase());
    // campos numéricos são type=text + inputmode (N04/N10); identificados por data-numeric
    const type = (await control.getAttribute("data-numeric")) ? "number" : (await control.getAttribute("type")) ?? "";
    const override = overrides[name];
    if (tagName === "select") {
      await expect(control).toBeEnabled();
      await expect.poll(async () => control.locator("option").count()).toBeGreaterThan(1);
      const options = await control.locator("option").evaluateAll(els => els.map(el => ({ value: (el as HTMLOptionElement).value, text: el.textContent ?? "" })));
      const pick = override instanceof RegExp ? options.find(o => o.value && override.test(o.text))
        : typeof override === "string" ? options.find(o => o.value === override)
        : options.find(o => o.value);
      if (!pick) throw new Error(`Sem opção para ${name}: ${JSON.stringify(options)}`);
      await control.selectOption(pick.value);
      filled[name] = pick.value;
      continue;
    }
    let value: string;
    if (typeof override === "string") value = override;
    else if (type === "number") value = "7";
    else if (type === "date") value = todayIso();
    else if (type === "email") value = `e2e-${tag.toLowerCase()}@teste.local`;
    else value = `${name}-${tag}`;
    await control.fill(value);
    filled[name] = value;
  }
  return filled;
}

/** Procura na seção da lista e confirma que o registro aparece. */
export async function expectRowInSection(section: Locator, term: string) {
  const search = section.getByRole("textbox", { name: /^Buscar em/ });
  await search.fill(term);
  await expect(section.getByTestId("record-row").filter({ hasText: term }).first()).toBeVisible();
}
