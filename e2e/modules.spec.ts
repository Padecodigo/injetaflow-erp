import { expect, test, type Page } from "@playwright/test";
import { expectRowInSection, fillRecordForm, login, uniq } from "./helpers";

/**
 * Requisito do cliente / B01, B05, B06: em TODOS os módulos, o registro criado aparece na hora
 * na lista e continua lá depois de recarregar a página.
 */
type Case = {
  module: string;
  route: string;
  section: string; // aria-label da seção da lista
  button: string; // botão que abre o formulário
  scopeButtonToSection?: boolean;
  key: string | "toast"; // campo usado na busca, ou o código mostrado no toast
  overrides?: Record<string, string | RegExp>;
};

const CASES: Case[] = [
  { module: "ordens", route: "/ordens", section: "Ordens", button: "Nova ordem", key: "cliente" },
  { module: "producao", route: "/producao", section: "Apontamentos registrados", button: "Novo apontamento", scopeButtonToSection: true, key: "toast", overrides: { matricula: "MAT-0001", ordem: /Em produção|Liberada|Planejada/ } },
  { module: "qualidade", route: "/qualidade", section: "Qualidade", button: "Novo registro", key: "produto" },
  { module: "estoque", route: "/estoque", section: "Estoque", button: "Novo item", key: "codigo" },
  { module: "movimentacoes", route: "/estoque", section: "Histórico de movimentações", button: "Nova movimentação", scopeButtonToSection: true, key: "documento", overrides: { tipo: "Entrada" } },
  { module: "moldes", route: "/moldes", section: "Moldes & ferramentaria", button: "Novo molde", key: "codigo" },
  { module: "materia_prima", route: "/materia-prima", section: "Matéria-prima", button: "Nova matéria-prima", key: "codigo" },
  { module: "pigmentos", route: "/pigmentos", section: "Pigmentos & cores", button: "Novo pigmento", key: "codigo" },
  { module: "manutencao", route: "/manutencao", section: "Manutenção", button: "Nova OS", key: "ativo" },
  { module: "colaboradores", route: "/rh", section: "Colaboradores", button: "Novo colaborador", scopeButtonToSection: true, key: "matricula" },
  { module: "financeiro", route: "/financeiro", section: "Financeiro", button: "Novo lançamento", key: "descricao" },
  { module: "regras", route: "/configuracoes", section: "Regras operacionais", button: "Nova regra", scopeButtonToSection: true, key: "nome" },
  { module: "solicitacoes", route: "/solicitacoes", section: "Solicitações do site", button: "Registrar contato", key: "nome" },
];

async function openForm(page: Page, c: Case) {
  const scope = c.scopeButtonToSection ? page.getByRole("region", { name: c.section }) : page;
  await scope.getByRole("button", { name: c.button }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe("criar registro aparece na lista e persiste após recarregar", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  for (const c of CASES) {
    test(`${c.module}: criar → ver na lista → F5 → continua lá`, async ({ page }) => {
      await page.goto(c.route);
      const tag = uniq();
      const dialog = await openForm(page, c);
      const filled = await fillRecordForm(dialog, tag, c.overrides);
      await dialog.locator("button[type=submit]").click();
      const toast = page.locator("[data-sonner-toast]").filter({ hasText: "Registro criado" });
      await expect(toast).toBeVisible();
      await expect(dialog).toBeHidden();
      let term = filled[c.key];
      if (c.key === "toast") term = (await toast.textContent())!.match(/[A-Z]{2,4}-\d{4}/)![0];
      expect(term).toBeTruthy();

      const section = page.getByRole("region", { name: c.section });
      // aparece imediatamente (sem recarregar)
      await expectRowInSection(section, term);
      // B05: cada valor na coluna certa (o termo está na linha e o código não é "NOVO")
      await expect(section.getByTestId("record-row").first()).not.toContainText("NOVO");

      await page.reload();
      await expectRowInSection(page.getByRole("region", { name: c.section }), term);
    });
  }
});

test("campos numéricos aceitam só números (quantidade da ordem)", async ({ page }) => {
  await login(page);
  await page.goto("/ordens");
  await page.getByRole("button", { name: "Nova ordem" }).first().click();
  const qty = page.getByRole("dialog").locator('input[name="quantidade"]');
  await expect(qty).toHaveAttribute("type", "number");
  await expect(qty).toHaveAttribute("inputmode", "numeric");
  await qty.pressSequentially("-12e3abc");
  await expect(qty).toHaveValue("123");
});
