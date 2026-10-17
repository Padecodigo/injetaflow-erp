import { describe, expect, it } from "vitest";
import { createAndLogin, setup } from "./helpers";
import { nextAllowed, registrarPonto, stateFromLast } from "../rh";
import { todayIso } from "../text";

async function withColab() {
  const ctx = await setup();
  await ctx.admin.caller.records.create({ module: "colaboradores", data: { matricula: "MAT-0001", nome: "Pessoa Um", cargo: "Operador", setor: "Produção", turno: "1º turno (06–14)", status: "Ativo" } });
  await ctx.admin.caller.records.create({ module: "colaboradores", data: { matricula: "MAT-0002", nome: "Pessoa Dois", cargo: "Inspetora", setor: "Qualidade", turno: "Administrativo (08–17)", status: "Ativo" } });
  await ctx.admin.caller.records.create({ module: "colaboradores", data: { matricula: "MAT-0003", nome: "Pessoa Três", cargo: "Técnico", setor: "Manutenção", turno: "Administrativo (08–17)", status: "Férias" } });
  return ctx;
}

describe("RH e ponto", () => {
  it("B06: novo colaborador aparece no quadro de presença e na lista", async () => {
    const { admin } = await withColab();
    const quadro = await admin.caller.rh.presenca();
    expect(quadro.pessoas.map(p => p.nome)).toEqual(["Pessoa Dois", "Pessoa Três", "Pessoa Um"]);
    expect(quadro.totais).toMatchObject({ ausentes: 2, afastados: 1, presentes: 0, escalados: 2 });
    expect((await admin.caller.records.list({ module: "colaboradores" })).total).toBe(3);
  });

  it("presentes, intervalo e saída seguem as batidas; origem simulada é marcada", async () => {
    const { admin } = await withColab();
    const entrada = await admin.caller.rh.registrarPonto({ matricula: "mat-0001", tipo: "Entrada", origem: "GPS" });
    expect(entrada).toMatchObject({ simulado: "sim", nome: "Pessoa Um", origem: "GPS" });
    await admin.caller.rh.registrarPonto({ matricula: "MAT-0002", tipo: "Entrada", origem: "Manual" });
    await admin.caller.rh.registrarPonto({ matricula: "MAT-0002", tipo: "Início de intervalo", origem: "Rede local" });
    const q = await admin.caller.rh.presenca();
    expect(q.totais).toMatchObject({ presentes: 1, intervalo: 1, ausentes: 0, batidas: 3 });
    expect(q.totais.origens).toMatchObject({ GPS: 1, Manual: 1, "Rede local": 1 });
  });

  it("recusa batida fora de sequência e matrícula inexistente", async () => {
    const { admin } = await withColab();
    await expect(admin.caller.rh.registrarPonto({ matricula: "MAT-0001", tipo: "Saída", origem: "GPS" })).rejects.toThrow(/fora de sequência/);
    await expect(admin.caller.rh.registrarPonto({ matricula: "XXX", tipo: "Entrada", origem: "GPS" })).rejects.toThrow(/não encontrada/);
    expect(nextAllowed(null)).toEqual(["Entrada"]);
    expect(nextAllowed("Início de intervalo")).toEqual(["Fim de intervalo"]);
    expect(stateFromLast("Saída")).toBe("Saiu");
  });

  it("B07: relatório calcula horas e intervalo e exporta CSV", async () => {
    const { repo, admin } = await withColab();
    const user = (await admin.caller.auth.me())!;
    const day = new Date();
    day.setHours(6, 0, 0, 0);
    const at = (min: number) => new Date(day.getTime() + min * 60000);
    await registrarPonto(repo, user, { matricula: "MAT-0001", tipo: "Entrada", origem: "Rede local", now: at(0) });
    await registrarPonto(repo, user, { matricula: "MAT-0001", tipo: "Início de intervalo", origem: "Rede local", now: at(240) });
    await registrarPonto(repo, user, { matricula: "MAT-0001", tipo: "Fim de intervalo", origem: "Rede local", now: at(300) });
    await registrarPonto(repo, user, { matricula: "MAT-0001", tipo: "Saída", origem: "Manual", now: at(540) });
    const hoje = todayIso(day);
    const rel = await admin.caller.rh.relatorio({ inicio: hoje, fim: hoje });
    const linha = rel.linhas.find(l => l.matricula === "MAT-0001")!;
    expect(linha).toMatchObject({ minutosTrabalhados: 480, minutosIntervalo: 60, situacao: "Regular", origens: "Rede local, Manual", simulado: true });
    const csv = await admin.caller.rh.relatorioCsv({ inicio: hoje, fim: hoje, matricula: "MAT-0001" });
    expect(csv.csv).toContain("Horas trabalhadas");
    expect(csv.csv).toContain("08:00");
    expect(csv.filename).toContain("MAT-0001");
    await expect(admin.caller.rh.relatorio({ inicio: "2026-10-10", fim: "2026-10-01" })).rejects.toThrow();
  });

  it("histórico do funcionário reúne batidas, ocorrências e apontamentos", async () => {
    const { admin } = await withColab();
    await admin.caller.rh.registrarPonto({ matricula: "MAT-0001", tipo: "Entrada", origem: "GPS" });
    const h = await admin.caller.rh.historico({ matricula: "MAT-0001" });
    expect(h.colaborador?.nome).toBe("Pessoa Um");
    expect(h.batidas).toHaveLength(1);
  });

  it("Meu perfil: apontamento pessoal e ponto próprio aparecem no histórico e persistem", async () => {
    const { repo, empresaId } = await setup();
    const colab = await createAndLogin(repo, empresaId, { email: "eu@teste.local", matricula: "MAT-0777", permissoes: {} });
    await colab.caller.perfil.novaOcorrencia({ tipo: "Atraso", data: "2026-10-17", descricao: "Trânsito na rodovia" });
    await colab.caller.perfil.registrarPonto({ tipo: "Entrada", origem: "Rede local" });
    const resumo = await colab.caller.perfil.resumo();
    expect(resumo.usuario.matricula).toBe("MAT-0777");
    expect(resumo.ocorrencias[0]).toMatchObject({ tipo: "Atraso", status: "Pendente" });
    expect(resumo.batidas[0]).toMatchObject({ tipo: "Entrada" });
  });
});
