import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { callerFor, setup } from "./helpers";
import { anexoPath } from "../publico";

const pdf = Buffer.from("%PDF-1.4 teste").toString("base64");
let tmp: string;
beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "injetaflow-up-"));
  process.env.INJETAFLOW_DATA_DIR = tmp;
  process.env.INJETAFLOW_PUBLIC_EMPRESA = "empresa-a";
});
afterAll(() => {
  delete process.env.INJETAFLOW_DATA_DIR;
  delete process.env.INJETAFLOW_PUBLIC_EMPRESA;
});

describe("formulários do portal público", () => {
  it("B20: cotação é gravada de verdade (com anexo) e aparece em Solicitações do ERP", async () => {
    const { repo, admin } = await setup("empresa-a");
    const anon = await callerFor(repo);
    const out = await anon.caller.publico.enviarSolicitacao({ tipo: "Cotação", nome: "Comprador", empresa: "Empresa X", email: "c@x.com", necessidade: "Desenvolver uma peça nova", etapa: "Tenho uma amostra física", volume: "Ainda estou avaliando", material: "Preciso de orientação", consentimento: true, anexo: { nome: "desenho.pdf", base64: pdf } });
    expect(out.protocolo).toBe("SOL-0001");
    const list = await admin.caller.records.list({ module: "solicitacoes" });
    expect(list.items[0]).toMatchObject({ tipo: "Cotação", empresa: "Empresa X", status: "Novo", codigo: "SOL-0001" });
    expect(String(list.items[0].anexo)).toContain("desenho.pdf");
    expect(anexoPath("empresa-a", String(list.items[0].anexoArquivo))).toContain(tmp);
  });

  it("B19: contato grava a mensagem", async () => {
    const { repo, admin } = await setup("empresa-a");
    const anon = await callerFor(repo, null, "1.1.1.1");
    await anon.caller.publico.enviarSolicitacao({ tipo: "Contato", nome: "Fulano", email: "f@x.com", assunto: "Produção recorrente", mensagem: "Gostaria de conversar", consentimento: true });
    const list = await admin.caller.records.list({ module: "solicitacoes", filters: { tipo: "Contato" } });
    expect(list.items[0]).toMatchObject({ assunto: "Produção recorrente", mensagem: "Gostaria de conversar" });
  });

  it("B21: trabalhe conosco faz upload real do currículo (PDF/DOC) e recusa outros formatos", async () => {
    const { repo, admin } = await setup("empresa-a");
    const anon = await callerFor(repo, null, "2.2.2.2");
    await expect(anon.caller.publico.enviarSolicitacao({ tipo: "Currículo", nome: "Candidata", email: "c@x.com", area: "Produção", consentimento: true, anexo: { nome: "virus.exe", base64: pdf } })).rejects.toThrow(/Formato/);
    await anon.caller.publico.enviarSolicitacao({ tipo: "Currículo", nome: "Candidata", email: "c@x.com", area: "Produção", consentimento: true, anexo: { nome: "cv.pdf", base64: pdf } });
    const list = await admin.caller.records.list({ module: "solicitacoes", filters: { tipo: "Currículo" } });
    expect(list.total).toBe(1);
    expect(String(list.items[0].anexo)).toContain("cv.pdf");
  });

  it("exige consentimento, bloqueia robô (honeypot) e limita envios por IP", async () => {
    const { repo } = await setup("empresa-a");
    const anon = await callerFor(repo, null, "3.3.3.3");
    const base = { tipo: "Contato" as const, nome: "N", email: "n@x.com", assunto: "Assunto", mensagem: "Mensagem longa" };
    await expect(anon.caller.publico.enviarSolicitacao({ ...base, nome: "Nome", consentimento: false as unknown as true })).rejects.toThrow();
    await expect(anon.caller.publico.enviarSolicitacao({ ...base, nome: "Nome", consentimento: true, website: "spam" })).rejects.toThrow();
    for (let i = 0; i < 8; i++) await anon.caller.publico.enviarSolicitacao({ ...base, nome: "Nome", consentimento: true }).catch(() => undefined);
    await expect(anon.caller.publico.enviarSolicitacao({ ...base, nome: "Nome", consentimento: true })).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });

  it("anexoPath não permite path traversal", () => {
    expect(anexoPath("empresa-a", "../../etc/passwd")).toBeNull();
  });
});
