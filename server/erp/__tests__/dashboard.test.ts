import { describe, expect, it } from "vitest";
import { setup } from "./helpers";
import { periodStart } from "../dashboard";

describe("dashboard operacional", () => {
  it("indicadores são calculados a partir dos dados gravados", async () => {
    const { admin } = await setup();
    const c = admin.caller.records.create;
    const empty = await admin.caller.dashboard.summary({ periodo: "hoje" });
    expect(empty.indicadores).toMatchObject({ producaoBoa: 0, ordensAtivas: 0, refugoPct: 0 });
    await c({ module: "moldes", data: { codigo: "M-1", descricao: "d", cavidades: 1, status: "Disponível" } });
    await c({ module: "colaboradores", data: { matricula: "MAT-1", nome: "Op", cargo: "Op", setor: "Produção", turno: "1º turno (06–14)", status: "Ativo" } });
    await c({ module: "ordens", data: { produto: "P", molde: "M-1", maquina: "I", quantidade: 1000, prioridade: "Urgente", status: "Liberada", entrega: "2020-01-01" } });
    await c({ module: "producao", data: { ordem: "OP-0001", matricula: "MAT-1", quantidadeBoa: 950, refugo: 50, turno: "1º turno" } });
    await c({ module: "estoque", data: { codigo: "E", material: "M", categoria: "Resina", saldo: 1, unidade: "kg", estoqueMinimo: 10, status: "Normal" } });
    await c({ module: "qualidade", data: { tipo: "Inspeção", loteOrdem: "L", produto: "P", severidade: "Crítica", status: "Quarentena", descricao: "d" } });
    await admin.caller.rh.registrarPonto({ matricula: "MAT-1", tipo: "Entrada", origem: "GPS" });
    const s = await admin.caller.dashboard.summary({ periodo: "hoje" });
    expect(s.indicadores).toMatchObject({ producaoBoa: 950, refugo: 50, refugoPct: 5, ordensAtivas: 1, ordensUrgentes: 1, ordensAtrasadas: 1, estoqueBaixo: 1, qualidadeAbertos: 1, presentes: 1 });
    expect(s.serie.reduce((sum, p) => sum + p.value, 0)).toBe(950);
    expect(s.ordens[0]).toMatchObject({ codigo: "OP-0001", progresso: 95 });
    expect(s.alertas.map(a => a.href)).toEqual(expect.arrayContaining(["/ordens", "/qualidade", "/estoque"]));
    const semana = await admin.caller.dashboard.summary({ periodo: "7d" });
    expect(semana.serie).toHaveLength(7);
  });

  it("período: hoje, 7 e 30 dias", () => {
    const now = new Date("2026-10-17T12:00:00");
    expect(periodStart("hoje", now)).toBe("2026-10-17");
    expect(periodStart("7d", now)).toBe("2026-10-11");
    expect(periodStart("30d", now)).toBe("2026-09-18");
  });
});
