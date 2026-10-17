import { expect, test } from "@playwright/test";
import { login } from "./helpers";

/**
 * F0a/F0c (planos RH/Ponto v2 e v3): o ERP não registra ponto, nem para si nem em nome de outra pessoa.
 * A origem oficial das marcações é o relógio (REP). As marcações já gravadas continuam visíveis, só leitura.
 */
const trpcPost = (path: string, json: unknown) => ({ path: `/api/trpc/${path}`, data: { json } });

test.describe("F0c: ponto só no relógio oficial", () => {
  test("RH: sem botão de registrar ponto; marcações já gravadas continuam listadas (somente leitura); atalho leva à ocorrência de ajuste", async ({ page }) => {
    await login(page);
    await page.goto("/rh");
    await expect(page.locator("main h1").first()).toBeVisible();
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("button", { name: /Registrar ponto/ })).toHaveCount(0);
    await expect(page.getByTestId("presence-row").first()).toBeVisible();
    await expect(page.getByTestId("presence-row").getByRole("button", { name: "Ponto", exact: true })).toHaveCount(0);
    // histórico somente leitura: a lista continua na tela com o que já foi gravado (o seed demo só grava batidas após 06:00)
    const registros = page.getByRole("region", { name: "Registros de ponto" });
    await expect(registros).toBeVisible();
    await expect(registros.getByRole("button", { name: /Registrar ponto/ })).toHaveCount(0);
    const input = encodeURIComponent(JSON.stringify({ json: { module: "ponto" } }));
    const lista = await (await page.request.get(`/api/trpc/records.list?input=${input}`)).json();
    const total: number = lista.result.data.json.total;
    if (total > 0) await expect(registros.getByTestId("record-row")).toHaveCount(Math.min(total, 10));
    else await expect(registros).toContainText("Nenhum registro");
    await page.locator(".page-header").getByRole("button", { name: "Registrar ocorrência" }).click();
    const dialog = page.getByRole("dialog", { name: /Registrar ocorrência de ajuste/ });
    await expect(dialog).toContainText("relógio oficial (REP)");
    await dialog.getByRole("button", { name: "Ver ocorrências para análise" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("region", { name: "Ocorrências para análise" })).toBeInViewport();
  });

  test("Meu perfil: sem botões de bater ponto nem seletor GPS/Rede; oferece ocorrência de ajuste", async ({ page }) => {
    await login(page);
    await page.goto("/meu-perfil");
    const painel = page.getByRole("region", { name: "Meu ponto" });
    await expect(painel).toContainText("relógio oficial (REP)");
    for (const tipo of ["Entrada", "Início de intervalo", "Fim de intervalo", "Saída"]) {
      await expect(page.getByRole("button", { name: tipo, exact: true })).toHaveCount(0);
    }
    await expect(page.getByRole("option", { name: /GPS|Rede local/ })).toHaveCount(0);
    await painel.getByRole("button", { name: "Registrar ocorrência de ajuste" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("API: registrar ponto pelo ERP responde 403, para si e em nome de outra pessoa, inclusive Administrador", async ({ page }) => {
    await login(page);
    for (const { path, data } of [
      trpcPost("rh.registrarPonto", { matricula: "MAT-0001", tipo: "Entrada", origem: "Manual" }),
      trpcPost("perfil.registrarPonto", { tipo: "Entrada", origem: "Rede local" }),
      trpcPost("records.create", { module: "ponto", data: { matricula: "MAT-0001", tipo: "Entrada", origem: "Manual" } }),
    ]) {
      const res = await page.request.post(path, { data });
      expect(res.status(), path).toBe(403);
      expect(await res.text(), path).toContain("relógio oficial");
    }
  });
});
