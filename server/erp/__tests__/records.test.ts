import { describe, expect, it } from "vitest";
import { callerFor, createAndLogin, setup } from "./helpers";

async function seedBasics(caller: Awaited<ReturnType<typeof setup>>["admin"]["caller"]) {
  await caller.records.create({ module: "moldes", data: { codigo: "M-0100", descricao: "Tampa 28", cavidades: 8, status: "Disponível" } });
  await caller.records.create({ module: "colaboradores", data: { matricula: "mat-0100", nome: "Operador Teste", cargo: "Operador", setor: "Produção", turno: "1º turno (06–14)", status: "Ativo" } });
}

describe("CRUD genérico dos módulos", () => {
  it("B01/B05: criar ordem aparece na hora no topo da lista, com cada valor no campo certo e código gerado", async () => {
    const { admin } = await setup();
    await seedBasics(admin.caller);
    const created = await admin.caller.records.create({ module: "ordens", data: { cliente: "Cliente X", produto: "Tampa 28mm", molde: "M-0100", maquina: "INJ-07", quantidade: "500", prioridade: "Alta", status: "Planejada", entrega: "2026-10-20", observacoes: "nota" } });
    expect(created.codigo).toBe("OP-0001");
    const list = await admin.caller.records.list({ module: "ordens" });
    expect(list.total).toBe(1);
    expect(list.items[0]).toMatchObject({ codigo: "OP-0001", cliente: "Cliente X", produto: "Tampa 28mm", molde: "M-0100", maquina: "INJ-07", quantidade: 500, prioridade: "Alta", status: "Planejada", entrega: "2026-10-20", progresso: 0 });
  });

  it("valida campos obrigatórios, opções e números", async () => {
    const { admin } = await setup();
    await expect(admin.caller.records.create({ module: "financeiro", data: { tipo: "Conta a pagar" } })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(admin.caller.records.create({ module: "financeiro", data: { tipo: "Inventado", descricao: "x", valor: 1, vencimento: "2026-01-01", status: "Em aberto" } })).rejects.toThrow(/opção inválida/);
    await expect(admin.caller.records.create({ module: "financeiro", data: { tipo: "Receita", descricao: "x", valor: "abc", vencimento: "2026-01-01", status: "Em aberto" } })).rejects.toThrow(/número/);
    const ok = await admin.caller.records.create({ module: "financeiro", data: { tipo: "Receita", descricao: "Venda", valor: "1234.5", vencimento: "2026-01-01", status: "Em aberto", hack: "ignorado" } });
    expect(ok).toMatchObject({ codigo: "LF-0001", valor: 1234.5, descricao: "Venda" });
    expect(ok).not.toHaveProperty("hack");
  });

  it("B04: editar e excluir (soft delete) funcionam e são auditados", async () => {
    const { admin, repo, empresaId } = await setup();
    const rec = await admin.caller.records.create({ module: "qualidade", data: { tipo: "Inspeção", loteOrdem: "L1", produto: "P", severidade: "Baixa", status: "Aberto", descricao: "d" } });
    const edited = await admin.caller.records.update({ module: "qualidade", id: rec.id, data: { status: "Quarentena", severidade: "Alta" } });
    expect(edited).toMatchObject({ status: "Quarentena", severidade: "Alta", produto: "P", codigo: "QL-0001" });
    await admin.caller.records.remove({ module: "qualidade", id: rec.id });
    expect((await admin.caller.records.list({ module: "qualidade" })).total).toBe(0);
    const stored = await repo.get("qualidade", empresaId, rec.id, true);
    expect(stored?.deletedAt).toBeTruthy();
    const audit = await admin.caller.config.auditoria({});
    expect(audit.items.map(i => i.acao)).toEqual(expect.arrayContaining(["criar", "editar", "excluir"]));
  });

  it("B08/B09: busca sem acento, filtro por status e paginação com total real", async () => {
    const { admin } = await setup();
    for (let i = 1; i <= 23; i++) {
      await admin.caller.records.create({ module: "pigmentos", data: { codigo: `COR-${i}`, cor: i === 7 ? "Azul Céu" : `Cor ${i}`, status: i % 2 ? "Aprovado" : "Em teste" } });
    }
    const p1 = await admin.caller.records.list({ module: "pigmentos", page: 1, pageSize: 10 });
    expect(p1).toMatchObject({ total: 23, pages: 3 });
    expect(p1.items).toHaveLength(10);
    const p3 = await admin.caller.records.list({ module: "pigmentos", page: 3, pageSize: 10 });
    expect(p3.items).toHaveLength(3);
    const busca = await admin.caller.records.list({ module: "pigmentos", search: "azul ceu" });
    expect(busca.items.map(i => i.codigo)).toEqual(["COR-7"]);
    const filtro = await admin.caller.records.list({ module: "pigmentos", filters: { status: "Em teste" } });
    expect(filtro.total).toBe(11);
    const sorted = await admin.caller.records.list({ module: "pigmentos", sortField: "codigo", sortDir: "asc", pageSize: 3 });
    expect(sorted.items.map(i => i.codigo)).toEqual(["COR-1", "COR-2", "COR-3"]);
  });

  it("filtro por período no campo de data principal (entrega das ordens)", async () => {
    const { admin } = await setup();
    await seedBasics(admin.caller);
    for (const entrega of ["2026-10-01", "2026-10-15", "2026-11-01"]) {
      await admin.caller.records.create({ module: "ordens", data: { produto: "P", molde: "M-0100", maquina: "I", quantidade: 1, prioridade: "Normal", status: "Planejada", entrega } });
    }
    const out = await admin.caller.records.list({ module: "ordens", dateFrom: "2026-10-10", dateTo: "2026-10-31" });
    expect(out.items.map(i => i.entrega)).toEqual(["2026-10-15"]);
  });

  it("B07: exportação CSV respeita o filtro e traz cabeçalhos legíveis", async () => {
    const { admin } = await setup();
    await admin.caller.records.create({ module: "financeiro", data: { tipo: "Receita", descricao: "Venda; especial", valor: 10.5, vencimento: "2026-10-01", status: "Recebido" } });
    await admin.caller.records.create({ module: "financeiro", data: { tipo: "Conta a pagar", descricao: "=cmd()", valor: 3, vencimento: "2026-10-02", status: "Em aberto" } });
    const all = await admin.caller.records.exportCsv({ module: "financeiro" });
    expect(all.count).toBe(2);
    expect(all.filename).toMatch(/^financeiro-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(all.csv.startsWith("\uFEFFLançamento;Tipo;Descrição")).toBe(true);
    expect(all.csv).toContain('"Venda; especial"');
    expect(all.csv).toContain("'=cmd()");
    const filtered = await admin.caller.records.exportCsv({ module: "financeiro", filters: { status: "Recebido" } });
    expect(filtered.count).toBe(1);
  });

  it("totais recalculados (financeiro) por tipo e status", async () => {
    const { admin } = await setup();
    await admin.caller.records.create({ module: "financeiro", data: { tipo: "Receita", descricao: "a", valor: 100, vencimento: "2026-10-01", status: "Recebido" } });
    await admin.caller.records.create({ module: "financeiro", data: { tipo: "Conta a pagar", descricao: "b", valor: 40.25, vencimento: "2026-10-01", status: "Em aberto" } });
    const s = await admin.caller.records.summary({ module: "financeiro" });
    expect(s).toMatchObject({ total: 2, sum: 140.25, byStatus: { Recebido: 1, "Em aberto": 1 }, sumsByType: { Receita: 100, "Conta a pagar": 40.25 } });
  });

  it("código único por empresa (molde, item de estoque, matrícula)", async () => {
    const { admin } = await setup();
    await seedBasics(admin.caller);
    await expect(admin.caller.records.create({ module: "moldes", data: { codigo: "m-0100", descricao: "dup", cavidades: 1, status: "Disponível" } })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(admin.caller.records.create({ module: "colaboradores", data: { matricula: "MAT-0100", nome: "Outro", cargo: "c", setor: "RH", turno: "1º turno (06–14)", status: "Ativo" } })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("ordem exige molde cadastrado", async () => {
    const { admin } = await setup();
    await expect(admin.caller.records.create({ module: "ordens", data: { produto: "P", molde: "M-NAO", maquina: "I", quantidade: 1, prioridade: "Normal", status: "Planejada", entrega: "2026-10-10" } })).rejects.toThrow(/não está cadastrado/);
  });

  it("apontamento rápido pela matrícula do operador (separada do login) atualiza o progresso da ordem", async () => {
    const { admin } = await setup();
    await seedBasics(admin.caller);
    await admin.caller.records.create({ module: "ordens", data: { produto: "P", molde: "M-0100", maquina: "I", quantidade: 1000, prioridade: "Normal", status: "Liberada", entrega: "2026-10-10" } });
    await expect(admin.caller.records.create({ module: "producao", data: { ordem: "OP-0001", matricula: "NAO-EXISTE", quantidadeBoa: 10, turno: "1º turno" } })).rejects.toThrow(/Matrícula/);
    const ap = await admin.caller.records.create({ module: "producao", data: { ordem: "OP-0001", matricula: "mat-0100", quantidadeBoa: 250, refugo: 5, turno: "1º turno" } });
    expect(ap).toMatchObject({ codigo: "AP-0001", operador: "Operador Teste", matricula: "MAT-0100" });
    const ordem = (await admin.caller.records.list({ module: "ordens" })).items[0];
    expect(ordem).toMatchObject({ progresso: 25, produzido: 250, status: "Em produção" });
  });

  it("estoque: entrada e saída alteram o saldo; saldo negativo é recusado", async () => {
    const { admin } = await setup();
    await admin.caller.records.create({ module: "estoque", data: { codigo: "RES-1", material: "PP", categoria: "Resina", saldo: 100, unidade: "kg", estoqueMinimo: 50, status: "Normal" } });
    await admin.caller.records.create({ module: "movimentacoes", data: { item: "RES-1", tipo: "Entrada", quantidade: 20 } });
    const mov = await admin.caller.records.create({ module: "movimentacoes", data: { item: "RES-1", tipo: "Saída", quantidade: 80 } });
    expect(mov).toMatchObject({ saldoAnterior: 120, saldoNovo: 40 });
    const item = (await admin.caller.records.list({ module: "estoque" })).items[0];
    expect(item).toMatchObject({ saldo: 40, status: "Reposição" });
    await expect(admin.caller.records.create({ module: "movimentacoes", data: { item: "RES-1", tipo: "Saída", quantidade: 41 } })).rejects.toThrow(/Saldo insuficiente/);
    expect((await admin.caller.records.list({ module: "movimentacoes" })).total).toBe(2);
  });

  it("matéria-prima: saída baixa o saldo do lote e lote em quarentena não é consumido", async () => {
    const { admin } = await setup();
    const lote = await admin.caller.records.create({ module: "materia_prima", data: { codigo: "R", material: "PP", tipo: "Resina virgem", fornecedor: "F", lote: "L1", quantidade: 100, status: "Liberado" } });
    const after = await admin.caller.records.consumirMateriaPrima({ id: lote.id, quantidade: 30 });
    expect(after.quantidade).toBe(70);
    await expect(admin.caller.records.consumirMateriaPrima({ id: lote.id, quantidade: 71 })).rejects.toThrow(/indisponível/);
    const q = await admin.caller.records.create({ module: "materia_prima", data: { codigo: "R2", material: "PP", tipo: "Resina virgem", fornecedor: "F", lote: "L2", quantidade: 10, status: "Quarentena" } });
    await expect(admin.caller.records.consumirMateriaPrima({ id: q.id, quantidade: 1 })).rejects.toThrow(/quarentena/);
  });

  it("busca global retorna resultados só dos módulos permitidos", async () => {
    const { admin, repo, empresaId } = await setup();
    await seedBasics(admin.caller);
    await admin.caller.records.create({ module: "financeiro", data: { tipo: "Receita", descricao: "M-0100 venda", valor: 1, vencimento: "2026-10-01", status: "Em aberto" } });
    const all = await admin.caller.records.searchAll({ q: "M-0100" });
    expect(all.map(r => r.module)).toEqual(expect.arrayContaining(["moldes", "financeiro"]));
    const op = await createAndLogin(repo, empresaId, { email: "op2@teste.local", permissoes: { moldes: "ver" } });
    const limited = await op.caller.records.searchAll({ q: "M-0100" });
    expect(limited.map(r => r.module)).toEqual(["moldes"]);
  });
});

describe("permissões granulares por módulo", () => {
  it("B10: colaborador sem permissão não acessa Financeiro, Usuários, Configurações e RH (nem pela API)", async () => {
    const { repo, empresaId } = await setup();
    const op = await createAndLogin(repo, empresaId, { email: "colab@teste.local", perfil: "Operador", permissoes: { producao: "editar", ordens: "ver" } });
    await expect(op.caller.records.list({ module: "financeiro" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(op.caller.usuarios.list({})).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(op.caller.config.auditoria({})).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(op.caller.rh.presenca()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(op.caller.records.list({ module: "colaboradores" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await op.caller.records.list({ module: "ordens" })).total).toBe(0);
  });

  it("acesso 'ver' lista mas não cria, edita nem exclui", async () => {
    const { repo, empresaId, admin } = await setup();
    const rec = await admin.caller.records.create({ module: "regras", data: { nome: "R", modulo: "Estoque", condicao: "c", responsavel: "r", status: "Ativa" } });
    const viewer = await createAndLogin(repo, empresaId, { email: "ver@teste.local", perfil: "Consulta", permissoes: { configuracoes: "ver" } });
    expect((await viewer.caller.records.list({ module: "regras" })).total).toBe(1);
    await expect(viewer.caller.records.create({ module: "regras", data: { nome: "x", modulo: "RH", condicao: "c", responsavel: "r", status: "Ativa" } })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(viewer.caller.records.update({ module: "regras", id: rec.id, data: { nome: "y" } })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(viewer.caller.records.remove({ module: "regras", id: rec.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("isolamento entre empresas: usuário da empresa B não vê nem altera dados da A", async () => {
    const { admin, repo } = await setup("empresa-a");
    const rec = await admin.caller.records.create({ module: "regras", data: { nome: "Só da A", modulo: "Estoque", condicao: "c", responsavel: "r", status: "Ativa" } });
    const outsider = await createAndLogin(repo, "empresa-b", { email: "b@teste.local", perfil: "Administrador" });
    expect((await outsider.caller.records.list({ module: "regras" })).total).toBe(0);
    await expect(outsider.caller.records.get({ module: "regras", id: rec.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(outsider.caller.records.update({ module: "regras", id: rec.id, data: { nome: "hack" } })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(outsider.caller.records.remove({ module: "regras", id: rec.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    const anon = await callerFor(repo);
    expect(await anon.caller.auth.me()).toBeNull();
  });
});
