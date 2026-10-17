import { expect, test } from "@playwright/test";
import { E2E_DEMO_SENHA, login, uniq } from "./helpers";

test("N07: colaborador registra, edita e cancela ocorrência; gestor/RH aprova ou recusa", async ({ browser }) => {
  const tag = uniq();
  const colab = await (await browser.newContext()).newPage();
  await login(colab, "operador.demo@wamovale.local", E2E_DEMO_SENHA);
  await colab.goto("/meu-perfil");

  const nova = async (descricao: string) => {
    await colab.getByRole("button", { name: "Novo apontamento" }).click();
    const form = colab.getByRole("form", { name: "Nova ocorrência" });
    await form.locator("select").selectOption("Atraso");
    await form.locator("textarea").fill(descricao);
    await form.getByRole("button", { name: "Registrar" }).click();
    await expect(colab.getByTestId("timeline-item").filter({ hasText: descricao })).toBeVisible();
  };
  await nova(`Atraso A ${tag}`);
  await nova(`Atraso B ${tag}`);

  // editar a própria pendente
  const itemA = colab.getByTestId("timeline-item").filter({ hasText: `Atraso A ${tag}` });
  await itemA.getByRole("button", { name: "Editar" }).click();
  const edit = colab.getByRole("form", { name: "Editar ocorrência" });
  await edit.locator("textarea").fill(`Atraso A editado ${tag}`);
  await edit.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(colab.getByTestId("timeline-item").filter({ hasText: `Atraso A editado ${tag}` })).toContainText("Pendente");

  // cancelar a B
  colab.once("dialog", d => d.accept());
  await colab.getByTestId("timeline-item").filter({ hasText: `Atraso B ${tag}` }).getByRole("button", { name: "Cancelar ocorrência" }).click();
  await expect(colab.getByTestId("timeline-item").filter({ hasText: `Atraso B ${tag}` })).toContainText("Cancelada");

  // gestor/RH analisa
  const gestor = await (await browser.newContext()).newPage();
  await login(gestor);
  await gestor.goto("/rh");
  const painel = gestor.getByRole("region", { name: "Ocorrências para análise" });
  const item = painel.getByTestId("ocorrencia-item").filter({ hasText: `Atraso A editado ${tag}` });
  await expect(item).toBeVisible();
  await expect(painel.getByTestId("ocorrencia-item").filter({ hasText: `Atraso B ${tag}` })).toHaveCount(0);
  await item.getByRole("button", { name: "Recusar" }).click();
  await expect(item.getByText("Parecer: informe o motivo da recusa.")).toBeVisible();
  await item.getByRole("textbox").fill("Justificativa aceita");
  await item.getByRole("button", { name: "Aprovar" }).click();
  await expect(painel.getByTestId("ocorrencia-item").filter({ hasText: `Atraso A editado ${tag}` })).toHaveCount(0);

  await colab.reload();
  const final = colab.getByTestId("timeline-item").filter({ hasText: `Atraso A editado ${tag}` });
  await expect(final).toContainText("Aprovada");
  await expect(final).toContainText("Justificativa aceita");
  await expect(final.getByRole("button", { name: "Editar" })).toHaveCount(0);
});
