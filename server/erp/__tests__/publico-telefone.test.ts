import { describe, expect, it } from "vitest";
import { telefoneError, TELEFONE_MENSAGEM } from "@shared/erp/contato";
import { callerFor, setup } from "./helpers";

const PDF = Buffer.from("%PDF-1.4 currículo de demonstração").toString("base64");

describe("N06 — Trabalhe conosco: telefone validado e currículo obrigatório", () => {
  it("N06: formato de telefone", () => {
    for (const ok of ["", "(12) 99999-0000", "12 3333-4444", "+55 12 99999-0000", "12999990000"]) expect(telefoneError(ok), ok).toBeNull();
    for (const bad of ["abc", "123", "(12) 9999-abcd", "99999999999999999", "12+999990000"]) expect(telefoneError(bad), bad).toBe(TELEFONE_MENSAGEM);
  });

  it("N06: API pública recusa telefone inválido com mensagem clara e aceita válido", async () => {
    const { repo } = await setup();
    const anon = await callerFor(repo, undefined, "10.0.0.61");
    const base = { tipo: "Currículo" as const, nome: "Candidata Demonstração", email: "candidata@example.com", area: "Qualidade", consentimento: true as const, anexo: { nome: "cv.pdf", base64: PDF } };
    await expect(anon.caller.publico.enviarSolicitacao({ ...base, telefone: "liga pra mim" })).rejects.toThrow(/Telefone inválido/);
    const ok = await anon.caller.publico.enviarSolicitacao({ ...base, telefone: "(12) 99999-0000" });
    expect(ok.protocolo).toMatch(/^SOL-/);
  });

  it("N06: currículo sem anexo é recusado pela API", async () => {
    const { repo } = await setup();
    const anon = await callerFor(repo, undefined, "10.0.0.62");
    await expect(anon.caller.publico.enviarSolicitacao({ tipo: "Currículo", nome: "Candidato Demonstração", email: "c@example.com", area: "Qualidade", consentimento: true } as never)).rejects.toThrow();
  });
});
