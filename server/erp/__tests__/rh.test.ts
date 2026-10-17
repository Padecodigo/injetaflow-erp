import { describe, expect, it } from "vitest";
import { createAndLogin, setup } from "./helpers";
import { nextAllowed, stateFromLast } from "../rh";
import { registrarPontoDemonstracao } from "../ponto-demonstracao";
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

  it("presentes, intervalo e saída seguem as batidas; marcação de demonstração é simulada e tem origem própria (P7-07)", async () => {
    const { repo, admin } = await withColab();
    const user = (await admin.caller.auth.me())!;
    // F0a/P7-05: só a função de demonstração (seed/testes) grava; não há rota
    const entrada = await registrarPontoDemonstracao(repo, user, { matricula: "mat-0001", tipo: "Entrada", demo: true });
    expect(entrada).toMatchObject({ simulado: "sim", nome: "Pessoa Um", origem: "Demonstração", validacao: "OK", foraDeSequencia: false });
    await registrarPontoDemonstracao(repo, user, { matricula: "MAT-0002", tipo: "Entrada", demo: true });
    await registrarPontoDemonstracao(repo, user, { matricula: "MAT-0002", tipo: "Início de intervalo", demo: true });
    const q = await admin.caller.rh.presenca();
    expect(q.totais).toMatchObject({ presentes: 1, intervalo: 1, ausentes: 0, batidas: 3 });
    expect(q.totais.origens).toEqual({ "Demonstração": 3 });
  });

  it("F0a (regressão): não recusa batida fora de sequência; grava e marca como DIVERGENTE", async () => {
    const { repo, admin } = await withColab();
    const user = (await admin.caller.auth.me())!;
    // antes da F0a: rejects.toThrow(/fora de sequência/). Portaria 671, arts. 74 e 98: nunca bloquear a marcação.
    const saida = await registrarPontoDemonstracao(repo, user, { matricula: "MAT-0001", tipo: "Saída", demo: true });
    expect(saida).toMatchObject({ tipo: "Saída", foraDeSequencia: true, validacao: "DIVERGENTE" });
    expect(String(saida.divergencia)).toMatch(/após "nenhuma batida" o esperado era Entrada/);
    // segunda Saída seguida também é gravada
    const saida2 = await registrarPontoDemonstracao(repo, user, { matricula: "MAT-0001", tipo: "Saída", demo: true });
    expect(saida2).toMatchObject({ foraDeSequencia: true });
    const { items } = await admin.caller.records.list({ module: "ponto" });
    expect(items).toHaveLength(2);
    expect(items.every(item => item.foraDeSequencia === true && item.validacao === "DIVERGENTE")).toBe(true);
    const auditoria = await admin.caller.config.auditoria({ search: "fora de sequência" });
    expect(auditoria.total).toBe(2);
  });

  it("F0a/P7-06: sequência válida fica com validacao OK e foraDeSequencia false (campos declarados no módulo)", async () => {
    const { repo, admin } = await withColab();
    const user = (await admin.caller.auth.me())!;
    const entrada = await registrarPontoDemonstracao(repo, user, { matricula: "MAT-0001", tipo: "Entrada", demo: true });
    const intervalo = await registrarPontoDemonstracao(repo, user, { matricula: "MAT-0001", tipo: "Início de intervalo", demo: true });
    for (const batida of [entrada, intervalo]) {
      expect(batida).toMatchObject({ foraDeSequencia: false, validacao: "OK" });
      expect(batida.divergencia).toBeUndefined();
    }
  });

  it("matrícula inexistente continua recusada; nextAllowed vira só sugestão", async () => {
    const { repo, admin } = await withColab();
    const user = (await admin.caller.auth.me())!;
    await expect(registrarPontoDemonstracao(repo, user, { matricula: "XXX", tipo: "Entrada", demo: true })).rejects.toThrow(/não encontrada/);
    expect(nextAllowed(null)).toEqual(["Entrada"]);
    expect(nextAllowed("Início de intervalo")).toEqual(["Fim de intervalo"]);
    expect(stateFromLast("Saída")).toBe("Saiu");
  });

  it("F0c: marcações já gravadas continuam visíveis (somente leitura) no RH, no histórico e em Meu perfil", async () => {
    const { repo, empresaId, admin } = await withColab();
    const user = (await admin.caller.auth.me())!;
    const day = new Date();
    day.setHours(6, 0, 0, 0);
    await registrarPontoDemonstracao(repo, user, { matricula: "MAT-0001", tipo: "Entrada", now: day, demo: true });
    await registrarPontoDemonstracao(repo, user, { matricula: "MAT-0001", tipo: "Saída", now: new Date(day.getTime() + 8 * 3600_000), demo: true });
    const colab = await createAndLogin(repo, empresaId, { email: "um@teste.local", matricula: "MAT-0001", permissoes: {} });
    // tentativa bloqueada (CRUD genérico) não some com o que já existe
    await expect(colab.caller.records.create({ module: "ponto", data: { matricula: "MAT-0001", tipo: "Entrada" } })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const lista = await admin.caller.records.list({ module: "ponto" });
    expect(lista.total).toBe(2);
    expect((await admin.caller.rh.historico({ matricula: "MAT-0001" })).batidas).toHaveLength(2);
    const resumo = await colab.caller.perfil.resumo();
    expect(resumo.batidas.map(b => b.tipo)).toEqual(["Saída", "Entrada"]);
    const hoje = todayIso(day);
    const rel = await admin.caller.rh.relatorio({ inicio: hoje, fim: hoje, matricula: "MAT-0001" });
    expect(rel.linhas[0]).toMatchObject({ situacao: "Regular", minutosTrabalhados: 480 });
    // somente leitura: editar e excluir continuam recusados (N11)
    const id = lista.items[0].id;
    await expect(admin.caller.records.update({ module: "ponto", id, data: { observacao: "x" } })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(admin.caller.records.remove({ module: "ponto", id })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(admin.caller.records.create({ module: "ponto", data: { matricula: "MAT-0001", tipo: "Entrada", origem: "Manual" } })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await admin.caller.records.list({ module: "ponto" })).total).toBe(2);
  });

  it("B07: relatório calcula horas e intervalo e exporta CSV", async () => {
    const { repo, admin } = await withColab();
    const user = (await admin.caller.auth.me())!;
    const day = new Date();
    day.setHours(6, 0, 0, 0);
    const at = (min: number) => new Date(day.getTime() + min * 60000);
    await registrarPontoDemonstracao(repo, user, { matricula: "MAT-0001", tipo: "Entrada", now: at(0), demo: true });
    await registrarPontoDemonstracao(repo, user, { matricula: "MAT-0001", tipo: "Início de intervalo", now: at(240), demo: true });
    await registrarPontoDemonstracao(repo, user, { matricula: "MAT-0001", tipo: "Fim de intervalo", now: at(300), demo: true });
    await registrarPontoDemonstracao(repo, user, { matricula: "MAT-0001", tipo: "Saída", now: at(540), demo: true });
    const hoje = todayIso(day);
    const rel = await admin.caller.rh.relatorio({ inicio: hoje, fim: hoje });
    const linha = rel.linhas.find(l => l.matricula === "MAT-0001")!;
    expect(linha).toMatchObject({ minutosTrabalhados: 480, minutosIntervalo: 60, situacao: "Regular", origens: "Demonstração", simulado: true });
    const csv = await admin.caller.rh.relatorioCsv({ inicio: hoje, fim: hoje, matricula: "MAT-0001" });
    expect(csv.csv).toContain("Horas trabalhadas");
    expect(csv.csv).toContain("08:00");
    expect(csv.filename).toContain("MAT-0001");
    await expect(admin.caller.rh.relatorio({ inicio: "2026-10-10", fim: "2026-10-01" })).rejects.toThrow();
  });

  it("histórico do funcionário reúne batidas, ocorrências e apontamentos", async () => {
    const { repo, admin } = await withColab();
    await registrarPontoDemonstracao(repo, (await admin.caller.auth.me())!, { matricula: "MAT-0001", tipo: "Entrada", demo: true });
    const h = await admin.caller.rh.historico({ matricula: "MAT-0001" });
    expect(h.colaborador?.nome).toBe("Pessoa Um");
    expect(h.batidas).toHaveLength(1);
  });

  it("Meu perfil: apontamento pessoal aparece no resumo; o ponto próprio não é mais registrado pelo ERP (F0c)", async () => {
    const { repo, empresaId } = await setup();
    const colab = await createAndLogin(repo, empresaId, { email: "eu@teste.local", matricula: "MAT-0777", permissoes: {} });
    await colab.caller.perfil.novaOcorrencia({ tipo: "Atraso", data: "2026-10-17", descricao: "Trânsito na rodovia" });
    await expect(colab.caller.records.create({ module: "ponto", data: { matricula: "MAT-0777", tipo: "Entrada" } })).rejects.toMatchObject({ code: "FORBIDDEN", message: expect.stringMatching(/relógio oficial/) });
    const resumo = await colab.caller.perfil.resumo();
    expect(resumo.usuario.matricula).toBe("MAT-0777");
    expect(resumo.ocorrencias[0]).toMatchObject({ tipo: "Atraso", status: "Pendente" });
    expect(resumo.batidas).toHaveLength(0);
  });
});
