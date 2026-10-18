// Auditoria back-end, B-03 (média): a trava "não analisa a própria ocorrência" comparava a MATRÍCULA. O administrador
// trocava a própria matrícula e aprovava a própria ocorrência. Agora a autoria é o ID do usuário (`usuarioId`/`createdBy`);
// o administrador continua podendo trocar a própria matrícula (decisão anterior), e a troca fica explícita na auditoria.
import { describe, expect, it } from "vitest";
import { PERFIL_PRESETS } from "@shared/erp/modules";
import { createUser } from "../users";
import { generatePassword } from "../password";
import { callerFor, login, setup } from "./helpers";

const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

describe("B-03: matrícula própria e autoaprovação", () => {
  it("trocar a própria matrícula não libera analisar a própria ocorrência", async () => {
    const { repo, admin } = await setup();
    const me = (await admin.caller.auth.me())!;
    const oc = await admin.caller.perfil.novaOcorrencia({ tipo: "Atraso", data: hoje, descricao: "minha ocorrência" });
    await expect(admin.caller.usuarios.update({ id: me.id, data: { matricula: "ADM-TEMP" } })).resolves.toMatchObject({ matricula: "ADM-TEMP" });
    const novaReq = await callerFor(repo, admin.token); // como no HTTP: o contexto relê o usuário a cada requisição
    await expect(novaReq.caller.rh.analisarOcorrencia({ id: oc.id, decisao: "Aprovada" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    // continua sendo dele: aparece em "minhas ocorrências" e ele pode cancelar
    expect((await novaReq.caller.perfil.minhasOcorrencias()).map(o => o.id)).toContain(oc.id);
    await expect(novaReq.caller.perfil.cancelarOcorrencia({ id: oc.id })).resolves.toMatchObject({ status: "Cancelada" });
  });

  it("a troca de matrícula pelo administrador fica auditada (e a da própria, destacada)", async () => {
    const { admin } = await setup();
    const me = (await admin.caller.auth.me())!;
    await admin.caller.usuarios.update({ id: me.id, data: { matricula: "ADM-0042" } });
    const { items } = await admin.caller.config.auditoria({ search: "ADM-0042", pageSize: 10 });
    expect(items.find(i => i.modulo === "usuarios")?.resumo).toMatch(/matrícula: "ADM-0001" → "ADM-0042".*PRÓPRIA matrícula/);
  });

  it("outro administrador analisa normalmente; quem assume a matrícula do autor não vira dono da ocorrência", async () => {
    const { repo, empresaId, admin } = await setup();
    const senha = generatePassword(12);
    await createUser(repo, null, empresaId, { nome: "Admin Dois", email: "admin2@t.local", senha, setor: "Administrativo", perfil: "Administrador", matricula: "ADM-0002", permissoes: PERFIL_PRESETS.Administrador, status: "Ativo" });
    const oc = await admin.caller.perfil.novaOcorrencia({ tipo: "Atraso", data: hoje, descricao: "ocorrência do admin 1" });
    const admin2 = await login(repo, "admin2@t.local", senha);
    // admin1 sai da matrícula ADM-0001 e o admin2 a assume: o admin2 não pode editar a ocorrência do admin1 como se fosse dele
    const id1 = (await admin.caller.auth.me())!.id;
    const id2 = (await admin2.caller.auth.me())!.id;
    await admin2.caller.usuarios.update({ id: id1, data: { matricula: "ADM-0009" } });
    await admin.caller.usuarios.update({ id: id2, data: { matricula: "ADM-0001" } });
    const admin2Novo = await callerFor(repo, admin2.token);
    await expect(admin2Novo.caller.perfil.cancelarOcorrencia({ id: oc.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await admin2Novo.caller.perfil.minhasOcorrencias()).map(o => o.id)).not.toContain(oc.id);
    // e, por não ser o autor, pode analisar? Não: a matrícula igual continua bloqueando como reforço
    await expect(admin2Novo.caller.rh.analisarOcorrencia({ id: oc.id, decisao: "Aprovada" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    // um terceiro analista, sem relação com a ocorrência, aprova
    await createUser(repo, null, empresaId, { nome: "Admin Três", email: "admin3@t.local", senha, setor: "Administrativo", perfil: "Administrador", matricula: "ADM-0003", permissoes: PERFIL_PRESETS.Administrador, status: "Ativo" });
    const admin3 = await login(repo, "admin3@t.local", senha);
    await expect(admin3.caller.rh.analisarOcorrencia({ id: oc.id, decisao: "Aprovada" })).resolves.toMatchObject({ status: "Aprovada" });
  });

  it("ocorrência antiga (sem usuarioId nem createdBy) continua usando a matrícula", async () => {
    const { repo, empresaId, admin } = await setup();
    const antiga = await repo.insert("ocorrencias", empresaId, { tipo: "Atraso", data: hoje, descricao: "registro antigo", matricula: "ADM-0001", nome: "Admin Teste", status: "Pendente" });
    await expect(admin.caller.rh.analisarOcorrencia({ id: antiga.id, decisao: "Aprovada" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await admin.caller.perfil.minhasOcorrencias()).map(o => o.id)).toContain(antiga.id);
  });
});
