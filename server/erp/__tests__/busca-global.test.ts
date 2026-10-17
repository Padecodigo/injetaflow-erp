import { describe, expect, it } from "vitest";
import { publicEmpresaId } from "../store";
import { callerFor, setup } from "./helpers";

describe("N13 — busca global inclui Solicitações do site", () => {
  it("N13: protocolo SOL-xxxx e nome do contato aparecem na busca global", async () => {
    const { repo, admin } = await setup(publicEmpresaId());
    const anon = await callerFor(repo, undefined, "10.0.0.130");
    const { protocolo } = await anon.caller.publico.enviarSolicitacao({ tipo: "Contato", nome: "Contato Demonstração Busca", email: "busca@example.com", assunto: "Comercial", mensagem: "Quero uma cotação de tampas", consentimento: true });
    const porProtocolo = await admin.caller.records.searchAll({ q: protocolo });
    expect(porProtocolo).toEqual(expect.arrayContaining([expect.objectContaining({ module: "solicitacoes", route: "/solicitacoes", titulo: protocolo })]));
    const porNome = await admin.caller.records.searchAll({ q: "Demonstração Busca" });
    expect(porNome.some(r => r.module === "solicitacoes")).toBe(true);
  });
});

describe("N13 — limite de resultados não corta Solicitações", () => {
  it("N13: com muitos resultados em outros módulos, Solicitações ainda aparece", async () => {
    const { MODULES, MODULE_KEYS } = await import("@shared/erp/modules");
    const { repo, admin, empresaId } = await setup(publicEmpresaId());
    for (const key of MODULE_KEYS.filter(k => k !== "solicitacoes")) {
      for (let i = 0; i < 6; i++) await repo.insert(key, empresaId, { [MODULES[key].searchFields[0]]: `Termo Comum ${key} ${i}` });
    }
    await repo.insert("solicitacoes", empresaId, { codigo: "SOL-0042", tipo: "Contato", nome: "Termo Comum do site", status: "Novo" });
    const hits = await admin.caller.records.searchAll({ q: "Termo Comum" });
    expect(hits.length).toBeLessThanOrEqual(40);
    expect(hits.some(h => h.module === "solicitacoes")).toBe(true);
    const porPrefixo = await admin.caller.records.searchAll({ q: "SOL-0042" });
    expect(porPrefixo[0]).toMatchObject({ module: "solicitacoes", titulo: "SOL-0042" });
  });
});
