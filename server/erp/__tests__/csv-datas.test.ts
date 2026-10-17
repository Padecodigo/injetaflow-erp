import { describe, expect, it } from "vitest";
import { formatCsvDate, toCsv } from "../csv";
import { setup } from "./helpers";

describe("N14 — datas dos CSVs em pt-BR (America/Sao_Paulo)", () => {
  it("N14: ISO UTC vira dd/mm/aaaa hh:mm no horário de Brasília; data pura vira dd/mm/aaaa", () => {
    expect(formatCsvDate("2026-10-17T16:05:30.123Z")).toBe("17/10/2026 13:05");
    expect(formatCsvDate("2026-10-18T01:30:00Z")).toBe("17/10/2026 22:30");
    expect(formatCsvDate("2026-10-20")).toBe("20/10/2026");
    expect(formatCsvDate("OP-2026-10")).toBe("OP-2026-10");
    expect(toCsv(["Quando"], [["2026-10-17T16:05:00.000Z"]])).toContain("17/10/2026 13:05");
  });

  it("N14: CSV de usuários traz 'Último acesso' em pt-BR (sem ISO/Z)", async () => {
    const { admin } = await setup();
    const out = await admin.caller.usuarios.exportCsv({});
    const linhas = out.csv.replace(/^\uFEFF/, "").split("\r\n");
    const header = linhas[0].split(";");
    const idx = header.findIndex(h => /Último acesso/i.test(h));
    expect(idx).toBeGreaterThanOrEqual(0);
    const valor = linhas[1].split(";")[idx];
    expect(valor).toMatch(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/);
    expect(out.csv).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
  });

  it("N14: CSV do Financeiro traz vencimento dd/mm/aaaa e criado em com hora local", async () => {
    const { admin } = await setup();
    await admin.caller.records.create({ module: "financeiro", data: { tipo: "Conta a pagar", descricao: "Energia (demonstração)", valor: "1234,56", vencimento: "2026-11-05", status: "Em aberto" } });
    const out = await admin.caller.records.exportCsv({ module: "financeiro" });
    expect(out.csv).toContain("05/11/2026");
    expect(out.csv).not.toMatch(/2026-11-05/);
    expect(out.csv).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
    expect(out.csv).toMatch(/\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/);
  });
});
