import { describe, expect, it } from "vitest";
import { PERFIL_PRESETS } from "@shared/erp/modules";
import { createAndLogin, setup } from "./helpers";

async function cenario() {
  const ctx = await setup();
  const colaborador = await createAndLogin(ctx.repo, ctx.empresaId, { email: "op.n07@teste.local", perfil: "Operador", permissoes: PERFIL_PRESETS.Operador, matricula: "OP-0700" });
  const outro = await createAndLogin(ctx.repo, ctx.empresaId, { email: "op2.n07@teste.local", perfil: "Operador", permissoes: PERFIL_PRESETS.Operador, matricula: "OP-0701" });
  const gestor = await createAndLogin(ctx.repo, ctx.empresaId, { email: "gestor.n07@teste.local", perfil: "Gestor", permissoes: PERFIL_PRESETS.Gestor, matricula: "GE-0700" });
  const consultaRh = await createAndLogin(ctx.repo, ctx.empresaId, { email: "cons.n07@teste.local", perfil: "Consulta", permissoes: { rh: "ver" }, matricula: "CO-0700" });
  return { ...ctx, colaborador, outro, gestor, consultaRh };
}

describe("N07 — fluxo de análise das ocorrências", () => {
  it("N07: colaborador edita e cancela a própria ocorrência pendente (com auditoria)", async () => {
    const { admin, colaborador } = await cenario();
    const oc = await colaborador.caller.perfil.novaOcorrencia({ tipo: "Atraso", data: "2026-10-15", descricao: "Trânsito na Dutra" });
    const editada = await colaborador.caller.perfil.editarOcorrencia({ id: oc.id, tipo: "Justificativa de ausência", data: "2026-10-15", descricao: "Consulta médica (atestado)" });
    expect(editada.tipo).toBe("Justificativa de ausência");
    expect(editada.status).toBe("Pendente");
    const cancelada = await colaborador.caller.perfil.cancelarOcorrencia({ id: oc.id });
    expect(cancelada.status).toBe("Cancelada");
    await expect(colaborador.caller.perfil.editarOcorrencia({ id: oc.id, tipo: "Atraso", data: "2026-10-15", descricao: "tentar de novo" })).rejects.toThrow(/não pode mais ser alterada/);
    const minhas = await colaborador.caller.perfil.minhasOcorrencias();
    expect(minhas.map(o => o.status)).toEqual(["Cancelada"]);
    const audit = await admin.caller.config.auditoria({ search: "Ocorrência", page: 1, pageSize: 20 });
    const resumos = audit.items.map(i => String((i as { resumo?: string }).resumo ?? JSON.stringify(i)));
    expect(resumos.some(r => /editada pelo colaborador/.test(r))).toBe(true);
    expect(resumos.some(r => /cancelada pelo colaborador/.test(r))).toBe(true);
  });

  it("N07: não dá para editar/cancelar ocorrência de outra pessoa", async () => {
    const { colaborador, outro } = await cenario();
    const oc = await colaborador.caller.perfil.novaOcorrencia({ tipo: "Atraso", data: "2026-10-15", descricao: "Trânsito na Dutra" });
    await expect(outro.caller.perfil.cancelarOcorrencia({ id: oc.id })).rejects.toThrow(/não encontrada/);
    await expect(outro.caller.perfil.editarOcorrencia({ id: oc.id, tipo: "Atraso", data: "2026-10-15", descricao: "alterando a dos outros" })).rejects.toThrow(/não encontrada/);
  });

  it("N07: gestor/RH aprova ou recusa (recusa exige parecer); consulta não analisa; status muda para o colaborador", async () => {
    const { colaborador, gestor, consultaRh } = await cenario();
    const a = await colaborador.caller.perfil.novaOcorrencia({ tipo: "Esquecimento de batida", data: "2026-10-14", descricao: "Esqueci a saída às 17h" });
    const b = await colaborador.caller.perfil.novaOcorrencia({ tipo: "Atraso", data: "2026-10-16", descricao: "Chegada 8h20" });
    const pendentes = await gestor.caller.rh.ocorrencias({ status: "Pendente" });
    expect(pendentes.map(o => o.id).sort()).toEqual([a.id, b.id].sort());
    await expect(consultaRh.caller.rh.analisarOcorrencia({ id: a.id, decisao: "Aprovada" })).rejects.toThrow();
    await expect(gestor.caller.rh.analisarOcorrencia({ id: b.id, decisao: "Recusada" })).rejects.toThrow(/motivo da recusa/);
    const aprovada = await gestor.caller.rh.analisarOcorrencia({ id: a.id, decisao: "Aprovada", parecer: "Ajuste lançado" });
    expect(aprovada).toMatchObject({ status: "Aprovada", analisadoPor: expect.stringContaining("gestor.n07") });
    await gestor.caller.rh.analisarOcorrencia({ id: b.id, decisao: "Recusada", parecer: "Sem justificativa" });
    await expect(gestor.caller.rh.analisarOcorrencia({ id: a.id, decisao: "Recusada", parecer: "x" })).rejects.toThrow(/já está "Aprovada"/);
    await expect(colaborador.caller.perfil.cancelarOcorrencia({ id: a.id })).rejects.toThrow(/não pode mais ser alterada/);
    const minhas = await colaborador.caller.perfil.minhasOcorrencias();
    expect(Object.fromEntries(minhas.map(o => [o.id, o.status]))).toEqual({ [a.id]: "Aprovada", [b.id]: "Recusada" });
    expect((await gestor.caller.rh.ocorrencias({ status: "Pendente" }))).toHaveLength(0);
  });

  it("N07: ninguém aprova a própria ocorrência", async () => {
    const { gestor } = await cenario();
    const oc = await gestor.caller.perfil.novaOcorrencia({ tipo: "Atraso", data: "2026-10-16", descricao: "Reunião externa" });
    await expect(gestor.caller.rh.analisarOcorrencia({ id: oc.id, decisao: "Aprovada" })).rejects.toThrow(/própria ocorrência/);
  });
});
