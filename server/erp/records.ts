import { TRPCError } from "@trpc/server";
import { PONTO_SO_NO_RELOGIO } from "@shared/erp/ponto";
import { z } from "zod";
import { MODULES, columnLabel, type FieldDef, type ModuleDef, type ModuleKey } from "@shared/erp/modules";
import type { DataRepository, StoredRecord } from "./repository";
import type { SessionUser, UserData } from "./types";
import { actorOf, audit } from "./audit";
import { formatCsvDate, toCsv } from "./csv";
import { dataDeCalendarioValida, normalizeText, semCaracteresDeControle } from "./text";

export type RecordData = Record<string, unknown>;
export type FlatRecord = RecordData & {
  id: string;
  createdAt: string;
  updatedAt: string;
  criadoPor?: string | null;
  atualizadoPor?: string | null;
  demo?: boolean;
};

export type ListQuery = {
  search?: string;
  filters?: Record<string, string | undefined>;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
  sortField?: string;
  sortDir?: "asc" | "desc";
};

import { numericError, parseNumeric, type NumericRule } from "@shared/erp/numbers";

/** Validador Zod de número (mesma regra do formulário): aceita número ou texto numérico. */
export function numericSchema(rule: NumericRule) {
  const obrigatorio = `${rule.label}: obrigatório (informe um número).`;
  return z.union([z.string(), z.number()], { message: obrigatorio }).superRefine((value, ctx) => {
    const error = value === "" ? obrigatorio : numericError(value, rule);
    if (error) ctx.addIssue({ code: "custom", message: error });
  }).transform(value => parseNumeric(value) as number);
}

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

function fieldSchema(field: FieldDef): z.ZodTypeAny {
  const required = { message: `${field.label}: obrigatório.` };
  switch (field.type) {
    case "number":
    case "money": {
      // aceita só números: texto, vazio, negativo, gigante (N03) ou decimal em inteiro (N04) são recusados
      return numericSchema({ label: field.label, integer: field.integer, min: field.min, max: field.max, money: field.type === "money" });
    }
    case "date":
      return z.string(required).regex(dateRegex, `${field.label}: data inválida (AAAA-MM-DD)`).refine(dataDeCalendarioValida, `${field.label}: data inexistente no calendário`);
    case "email":
      return z.string(required).trim().toLowerCase().email(`${field.label}: e-mail inválido`).max(200);
    case "select":
      return z.enum(field.options as [string, ...string[]], { error: issue => (issue.input === undefined || issue.input === "" ? `${field.label}: obrigatório.` : `${field.label}: opção inválida.`) });
    case "textarea":
      return z.string(required).trim().max(4000, `${field.label}: texto muito longo`).refine(semCaracteresDeControle, `${field.label}: caracteres de controle ou de direção do texto não são permitidos`);
    default:
      return z.string(required).trim().max(300, `${field.label}: texto muito longo`).refine(semCaracteresDeControle, `${field.label}: caracteres de controle ou de direção do texto não são permitidos`);
  }
}

/** Monta o validador Zod a partir da definição do módulo (mesmo catálogo do formulário). */
export function buildSchema(mod: ModuleDef, mode: "create" | "update") {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const field of mod.fields) {
    if (field.readOnly) continue;
    let schema = fieldSchema(field);
    const isText = !["number", "money", "select", "date"].includes(field.type);
    if (field.required && mode === "create") {
      shape[field.name] = isText ? (schema as z.ZodString).min(1, `${field.label}: obrigatório`) : schema;
      continue;
    }
    if (field.required) {
      shape[field.name] = (isText ? (schema as z.ZodString).min(1, `${field.label}: obrigatório`) : schema).optional();
      continue;
    }
    // opcional: aceita vazio
    schema = z.preprocess(v => (v === "" || v === null ? undefined : v), schema.optional());
    shape[field.name] = schema;
  }
  return z.object(shape).strip();
}

export function validateInput(mod: ModuleDef, input: unknown, mode: "create" | "update"): RecordData {
  const parsed = buildSchema(mod, mode).safeParse(input ?? {});
  if (!parsed.success) {
    const message = parsed.error.issues.map(issue => issue.message).join("; ");
    throw new TRPCError({ code: "BAD_REQUEST", message });
  }
  return parsed.data as RecordData;
}

export function flatten(record: StoredRecord<RecordData>): FlatRecord {
  return {
    ...record.data,
    id: record.id,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    criadoPor: record.createdBy?.nome ?? null,
    atualizadoPor: record.updatedBy?.nome ?? null,
    ...(record.demo ? { demo: true } : {}),
  };
}

function dateFieldOf(mod: ModuleDef): string {
  return mod.fields.find(field => field.type === "date" && field.required)?.name ?? "createdAt";
}

export function matches(mod: ModuleDef, data: RecordData, record: StoredRecord<RecordData>, query: ListQuery): boolean {
  if (query.search && query.search.trim()) {
    const needle = normalizeText(query.search);
    const haystack = mod.searchFields.map(name => normalizeText(data[name])).join(" ");
    if (!haystack.includes(needle)) return false;
  }
  const allowedFilters = new Set([mod.statusField, ...(mod.filterFields ?? [])].filter(Boolean) as string[]);
  for (const [key, value] of Object.entries(query.filters ?? {})) {
    if (!value || !allowedFilters.has(key)) continue;
    if (String(data[key] ?? "") !== value) return false;
  }
  if (query.dateFrom || query.dateTo) {
    const field = dateFieldOf(mod);
    const raw = field === "createdAt" ? record.createdAt.slice(0, 10) : String(data[field] ?? "");
    if (!raw) return false;
    if (query.dateFrom && raw < query.dateFrom) return false;
    if (query.dateTo && raw > query.dateTo) return false;
  }
  return true;
}

function compareValues(a: unknown, b: unknown): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a ?? "").localeCompare(String(b ?? ""), "pt-BR", { numeric: true });
}

/** Soma de peças boas por ordem (base para o progresso). */
async function producedByOrder(repo: DataRepository, empresaId: string): Promise<Map<string, { boas: number; refugo: number }>> {
  const { items } = await repo.list<RecordData>("producao", empresaId);
  const totals = new Map<string, { boas: number; refugo: number }>();
  for (const item of items) {
    const key = String(item.data.ordem ?? "");
    const current = totals.get(key) ?? { boas: 0, refugo: 0 };
    current.boas += Number(item.data.quantidadeBoa ?? 0) || 0;
    current.refugo += Number(item.data.refugo ?? 0) || 0;
    totals.set(key, current);
  }
  return totals;
}

async function enrich(repo: DataRepository, empresaId: string, mod: ModuleDef, rows: FlatRecord[]): Promise<FlatRecord[]> {
  if (mod.key !== "ordens") return rows;
  const totals = await producedByOrder(repo, empresaId);
  return rows.map(row => {
    const produced = totals.get(String(row.codigo))?.boas ?? 0;
    const planned = Number(row.quantidade ?? 0) || 0;
    return { ...row, produzido: produced, progresso: planned > 0 ? Math.min(100, Math.round((produced / planned) * 100)) : 0 };
  });
}

export async function listRecords(repo: DataRepository, empresaId: string, moduleKey: ModuleKey, query: ListQuery = {}) {
  const mod = MODULES[moduleKey];
  const page = Math.max(1, Math.floor(query.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Math.floor(query.pageSize ?? 10)));
  const sortField = query.sortField && (mod.fields.some(f => f.name === query.sortField) || ["createdAt", "updatedAt"].includes(query.sortField)) ? query.sortField : undefined;
  const dir = query.sortDir === "asc" ? 1 : -1;
  const sort = sortField
    ? (a: StoredRecord<RecordData>, b: StoredRecord<RecordData>) => {
        const va = sortField === "createdAt" || sortField === "updatedAt" ? a[sortField] : a.data[sortField];
        const vb = sortField === "createdAt" || sortField === "updatedAt" ? b[sortField] : b.data[sortField];
        return compareValues(va, vb) * dir;
      }
    : undefined;
  const { items, total } = await repo.list<RecordData>(moduleKey, empresaId, {
    filter: (data, record) => matches(mod, data, record, query),
    sort,
    offset: (page - 1) * pageSize,
    limit: pageSize,
  });
  const rows = await enrich(repo, empresaId, mod, items.map(flatten));
  return { items: rows, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function getRecord(repo: DataRepository, empresaId: string, moduleKey: ModuleKey, id: string) {
  const record = await repo.get<RecordData>(moduleKey, empresaId, id);
  if (!record) throw new TRPCError({ code: "NOT_FOUND", message: "Registro não encontrado." });
  const [row] = await enrich(repo, empresaId, MODULES[moduleKey], [flatten(record)]);
  return row;
}

async function assertUnique(repo: DataRepository, empresaId: string, mod: ModuleDef, data: RecordData, ignoreId?: string) {
  for (const field of mod.uniqueFields ?? []) {
    const value = data[field];
    if (value === undefined || value === "") continue;
    const { total } = await repo.list<RecordData>(mod.key, empresaId, {
      filter: (row, record) => record.id !== ignoreId && normalizeText(row[field]) === normalizeText(value),
      limit: 1,
    });
    if (total > 0) {
      throw new TRPCError({ code: "CONFLICT", message: `${columnLabel(mod, field)} "${String(value)}" já está cadastrado.` });
    }
  }
}

async function nextCode(repo: DataRepository, empresaId: string, mod: ModuleDef): Promise<string> {
  const { field, prefix } = mod.autoCode!;
  const { items } = await repo.list<RecordData>(mod.key, empresaId, { includeDeleted: true });
  let max = 0;
  for (const item of items) {
    const match = String(item.data[field] ?? "").match(/(\d+)$/);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

/** Procura a matrícula entre colaboradores (RH) e usuários ativos da empresa. */
export async function findByMatricula(repo: DataRepository, empresaId: string, matricula: string): Promise<{ nome: string; origem: "colaborador" | "usuario" } | null> {
  const wanted = normalizeText(matricula);
  if (!wanted) return null;
  const colaborador = await repo.list<RecordData>("colaboradores", empresaId, {
    filter: data => normalizeText(data.matricula) === wanted && data.status !== "Desligado",
    limit: 1,
  });
  if (colaborador.items[0]) return { nome: String(colaborador.items[0].data.nome), origem: "colaborador" };
  const usuario = await repo.list<UserData>("usuarios", empresaId, {
    filter: data => normalizeText(data.matricula) === wanted && data.status === "Ativo",
    limit: 1,
  });
  if (usuario.items[0]) return { nome: usuario.items[0].data.nome, origem: "usuario" };
  return null;
}

async function findOneBy(repo: DataRepository, empresaId: string, collection: string, field: string, value: unknown) {
  const { items } = await repo.list<RecordData>(collection, empresaId, {
    filter: data => normalizeText(data[field]) === normalizeText(value),
    limit: 1,
  });
  return items[0] ?? null;
}

/** Efeito colateral de uma regra, executado só DEPOIS de o registro principal ser gravado (B-15). */
type Efeito = () => Promise<void>;

/** Regras específicas de cada módulo antes de gravar. Efeitos em outros registros vão para `efeitos`. */
async function applyRules(repo: DataRepository, user: SessionUser, mod: ModuleDef, data: RecordData, existing?: StoredRecord<RecordData>, efeitos: Efeito[] = []) {
  const empresaId = user.empresaId;
  if (mod.key === "producao") {
    const ordemCodigo = data.ordem ?? existing?.data.ordem;
    const ordem = await findOneBy(repo, empresaId, "ordens", "codigo", ordemCodigo);
    if (!ordem) throw new TRPCError({ code: "BAD_REQUEST", message: `Ordem "${String(ordemCodigo)}" não encontrada.` });
    if (["Concluída", "Cancelada"].includes(String(ordem.data.status)) && !existing) {
      throw new TRPCError({ code: "BAD_REQUEST", message: `A ordem ${String(ordemCodigo)} está ${String(ordem.data.status).toLowerCase()} e não aceita apontamentos.` });
    }
    const matricula = data.matricula ?? existing?.data.matricula;
    const pessoa = await findByMatricula(repo, empresaId, String(matricula ?? ""));
    if (!pessoa) throw new TRPCError({ code: "BAD_REQUEST", message: `Matrícula "${String(matricula)}" não encontrada ou inativa.` });
    data.operador = pessoa.nome;
    data.matricula = String(matricula).trim().toUpperCase();
    if (data.refugo === undefined && !existing) data.refugo = 0;
    if (!existing && ["Planejada", "Liberada"].includes(String(ordem.data.status))) {
      // B-15: a ordem só muda depois de o apontamento ser gravado, com ator e auditoria
      const anterior = String(ordem.data.status);
      efeitos.push(async () => {
        await repo.update("ordens", empresaId, ordem.id, { status: "Em produção" }, actorOf(user));
        await audit(repo, empresaId, user, { acao: "editar", modulo: "ordens", registroId: ordem.id, resumo: `Ordem ${String(ordem.data.codigo)}: status "${anterior}" → "Em produção" (automático, 1º apontamento de produção)` });
      });
    }
  }
  if (mod.key === "ordens" && data.molde) {
    const molde = await findOneBy(repo, empresaId, "moldes", "codigo", data.molde);
    if (!molde) throw new TRPCError({ code: "BAD_REQUEST", message: `Molde "${String(data.molde)}" não está cadastrado em Moldes.` });
  }
  if (mod.key === "colaboradores" && typeof data.matricula === "string") data.matricula = data.matricula.trim().toUpperCase();
}

export async function createRecord(repo: DataRepository, user: SessionUser, moduleKey: ModuleKey, input: unknown, opts: { demo?: boolean } = {}) {
  const mod = MODULES[moduleKey];
  if (moduleKey === "movimentacoes") return createMovement(repo, user, input, opts);
  // F0c: o ERP não cria marcação de ponto por nenhum caminho (o ponto é registrado no relógio oficial)
  if (moduleKey === "ponto") throw new TRPCError({ code: "FORBIDDEN", message: PONTO_SO_NO_RELOGIO });
  const data = validateInput(mod, input, "create");
  if (mod.autoCode) data[mod.autoCode.field] = await nextCode(repo, user.empresaId, mod);
  const efeitos: Efeito[] = [];
  await applyRules(repo, user, mod, data, undefined, efeitos);
  await assertUnique(repo, user.empresaId, mod, data);
  const record = await repo.insert<RecordData>(moduleKey, user.empresaId, data, { actor: actorOf(user), demo: opts.demo });
  await audit(repo, user.empresaId, user, { acao: "criar", modulo: moduleKey, registroId: record.id, resumo: `${mod.singular} ${describe(mod, data)}` });
  for (const efeito of efeitos) await efeito();
  return getRecord(repo, user.empresaId, moduleKey, record.id);
}

export async function updateRecord(repo: DataRepository, user: SessionUser, moduleKey: ModuleKey, id: string, input: unknown) {
  const mod = MODULES[moduleKey];
  if (moduleKey === "ponto") {
    throw new TRPCError({ code: "FORBIDDEN", message: PONTO_IMUTAVEL });
  }
  if (moduleKey === "movimentacoes") return updateMovement(repo, user, id, input);
  const existing = await repo.get<RecordData>(moduleKey, user.empresaId, id);
  if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Registro não encontrado." });
  const data = validateInput(mod, input, "update");
  if (mod.autoCode) delete data[mod.autoCode.field];
  await applyRules(repo, user, mod, data, existing);
  await assertUnique(repo, user.empresaId, mod, { ...existing.data, ...data }, id);
  await repo.update<RecordData>(moduleKey, user.empresaId, id, data, actorOf(user));
  // B-07: a trilha guarda o antes → depois de cada campo alterado
  const mudancas = describeChanges(mod, existing.data, data);
  await audit(repo, user.empresaId, user, { acao: "editar", modulo: moduleKey, registroId: id, resumo: `${mod.singular} ${describe(mod, { ...existing.data, ...data })}${mudancas ? ` — ${mudancas}` : " (sem alterações)"}` });
  return getRecord(repo, user.empresaId, moduleKey, id);
}

export async function deleteRecord(repo: DataRepository, user: SessionUser, moduleKey: ModuleKey, id: string) {
  const mod = MODULES[moduleKey];
  const existing = await repo.get<RecordData>(moduleKey, user.empresaId, id);
  if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Registro não encontrado." });
  if (moduleKey === "ponto") throw new TRPCError({ code: "FORBIDDEN", message: PONTO_IMUTAVEL });
  if (moduleKey === "movimentacoes") return deleteMovement(repo, user, existing);
  await repo.softDelete(moduleKey, user.empresaId, id, actorOf(user));
  await audit(repo, user.empresaId, user, { acao: "excluir", modulo: moduleKey, registroId: id, resumo: `${mod.singular} ${describe(mod, existing.data)}` });
  return { success: true as const };
}

const valorAuditoria = (value: unknown) => {
  if (value === undefined || value === null || value === "") return "(vazio)";
  const texto = typeof value === "object" ? JSON.stringify(value) : String(value);
  return texto.length > 80 ? `${texto.slice(0, 77)}...` : texto;
};

/** B-07: "Valor: 10 → 999999; Status: Em aberto → Pago" (só os campos que mudaram; sem campos de senha). */
export function describeChanges(mod: ModuleDef, before: RecordData, patch: RecordData): string {
  return Object.keys(patch)
    .filter(key => !/senha|password|hash/i.test(key) && valorAuditoria(patch[key]) !== valorAuditoria(before[key]))
    .map(key => `${columnLabel(mod, key)}: ${valorAuditoria(before[key])} → ${valorAuditoria(patch[key])}`)
    .join("; ");
}

function describe(mod: ModuleDef, data: RecordData): string {
  const key = mod.autoCode?.field ?? mod.uniqueFields?.[0] ?? mod.searchFields[0];
  return String(data[key] ?? data.nome ?? "").trim();
}

/** F0c (plano RH/Ponto v3, §7): orientação única para qualquer tentativa de registrar ponto pelo ERP. */
export { PONTO_SO_NO_RELOGIO };
/** N11: marcação de ponto não se apaga nem se edita (Portaria 671/MTE). */
export const PONTO_IMUTAVEL = "Marcações de ponto não podem ser editadas nem excluídas (Portaria 671/MTE). Registre uma ocorrência de ajuste para o RH analisar.";

/** Teto de saldo de estoque (N03). */
export const MAX_SALDO = 1_000_000_000;

type StoredMovement = StoredRecord<RecordData>;

/** Efeito que a movimentação teve no saldo (positivo = aumentou). */
function movementEffect(mov: RecordData): number {
  return (Number(mov.saldoNovo) || 0) - (Number(mov.saldoAnterior) || 0);
}

function computeSaldo(tipo: unknown, saldoAtual: number, quantidade: number): number {
  return tipo === "Entrada" ? saldoAtual + quantidade : tipo === "Saída" ? saldoAtual - quantidade : quantidade;
}

function assertSaldo(saldo: number, item: StoredRecord<RecordData>, contexto: string) {
  const unidade = String(item.data.unidade ?? "");
  if (saldo < 0) throw new TRPCError({ code: "BAD_REQUEST", message: `${contexto}: o saldo de ${String(item.data.codigo)} ficaria negativo (${formatQty(saldo)} ${unidade}).` });
  if (saldo > MAX_SALDO) throw new TRPCError({ code: "BAD_REQUEST", message: `${contexto}: o saldo de ${String(item.data.codigo)} passaria do máximo permitido (${formatQty(MAX_SALDO)}).` });
}

function formatQty(n: number): string {
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}

function roundQty(n: number): number {
  return Math.round(n * 1000) / 1000;
}

async function setItemSaldo(repo: DataRepository, user: SessionUser, item: StoredRecord<RecordData>, saldoNovo: number) {
  const minimo = Number(item.data.estoqueMinimo ?? 0) || 0;
  const patch: RecordData = { saldo: saldoNovo };
  if (item.data.status === "Normal" && minimo > 0 && saldoNovo < minimo) patch.status = "Reposição";
  if (item.data.status === "Reposição" && saldoNovo >= minimo) patch.status = "Normal";
  await repo.update("estoque", user.empresaId, item.id, patch, actorOf(user));
}

/** Entrada/saída/ajuste de estoque: grava a movimentação e altera o saldo do item. */
export async function createMovement(repo: DataRepository, user: SessionUser, input: unknown, opts: { demo?: boolean } = {}) {
  const mod = MODULES.movimentacoes;
  const data = validateInput(mod, input, "create");
  const item = await findOneBy(repo, user.empresaId, "estoque", "codigo", data.item);
  if (!item) throw new TRPCError({ code: "BAD_REQUEST", message: `Item "${String(data.item)}" não encontrado no estoque.` });
  const saldoAnterior = Number(item.data.saldo ?? 0) || 0;
  const quantidade = Number(data.quantidade);
  const saldoNovo = roundQty(computeSaldo(data.tipo, saldoAnterior, quantidade));
  if (saldoNovo < 0) throw new TRPCError({ code: "BAD_REQUEST", message: `Saldo insuficiente: disponível ${saldoAnterior} ${String(item.data.unidade ?? "")}.` });
  assertSaldo(saldoNovo, item, "Movimentação recusada");
  await setItemSaldo(repo, user, item, saldoNovo);
  const record = await repo.insert<RecordData>("movimentacoes", user.empresaId, { ...data, item: item.data.codigo, saldoAnterior, saldoNovo }, { actor: actorOf(user), demo: opts.demo });
  await audit(repo, user.empresaId, user, { acao: "movimentar", modulo: "estoque", registroId: item.id, resumo: `${String(data.tipo)} de ${quantidade} em ${String(item.data.codigo)} (${saldoAnterior} → ${saldoNovo})` });
  return flatten(record);
}

/** N02: excluir uma movimentação estorna o efeito dela no saldo (com auditoria). */
async function deleteMovement(repo: DataRepository, user: SessionUser, mov: StoredMovement) {
  const item = await findOneBy(repo, user.empresaId, "estoque", "codigo", mov.data.item);
  let resumoSaldo = "item não encontrado, saldo não alterado";
  if (item) {
    const atual = Number(item.data.saldo ?? 0) || 0;
    const estornado = roundQty(atual - movementEffect(mov.data));
    assertSaldo(estornado, item, "Não é possível excluir esta movimentação");
    await setItemSaldo(repo, user, item, estornado);
    resumoSaldo = `saldo de ${String(item.data.codigo)} ${atual} → ${estornado}`;
  }
  await repo.softDelete("movimentacoes", user.empresaId, mov.id, actorOf(user));
  await audit(repo, user.empresaId, user, { acao: "excluir", modulo: "movimentacoes", registroId: mov.id, resumo: `Estorno de ${String(mov.data.tipo)} de ${String(mov.data.quantidade)} em ${String(mov.data.item)} (${resumoSaldo})` });
  return { success: true as const };
}

/** N02: editar uma movimentação desfaz o efeito antigo e aplica o novo, validando o saldo. */
async function updateMovement(repo: DataRepository, user: SessionUser, id: string, input: unknown) {
  const mod = MODULES.movimentacoes;
  const mov = await repo.get<RecordData>("movimentacoes", user.empresaId, id);
  if (!mov) throw new TRPCError({ code: "NOT_FOUND", message: "Registro não encontrado." });
  const patch = validateInput(mod, input, "update");
  const next = { ...mov.data, ...patch };
  const affectsStock = ["item", "tipo", "quantidade"].some(key => key in patch && String(patch[key]) !== String(mov.data[key]));
  if (!affectsStock) {
    await repo.update<RecordData>("movimentacoes", user.empresaId, id, patch, actorOf(user));
    await audit(repo, user.empresaId, user, { acao: "editar", modulo: "movimentacoes", registroId: id, resumo: `Movimentação de ${String(mov.data.item)} (dados sem efeito no saldo)` });
    return getRecord(repo, user.empresaId, "movimentacoes", id);
  }
  const oldItem = await findOneBy(repo, user.empresaId, "estoque", "codigo", mov.data.item);
  const newItem = String(next.item) === String(mov.data.item) ? oldItem : await findOneBy(repo, user.empresaId, "estoque", "codigo", next.item);
  if (!newItem) throw new TRPCError({ code: "BAD_REQUEST", message: `Item "${String(next.item)}" não encontrado no estoque.` });
  // 1) desfaz o efeito antigo
  let oldSaldoDepoisEstorno: number | null = null;
  if (oldItem) {
    oldSaldoDepoisEstorno = roundQty((Number(oldItem.data.saldo ?? 0) || 0) - movementEffect(mov.data));
    assertSaldo(oldSaldoDepoisEstorno, oldItem, "Não é possível alterar esta movimentação");
  }
  // 2) aplica o novo efeito
  const base = oldItem && newItem.id === oldItem.id ? oldSaldoDepoisEstorno! : Number(newItem.data.saldo ?? 0) || 0;
  const saldoNovo = roundQty(computeSaldo(next.tipo, base, Number(next.quantidade)));
  assertSaldo(saldoNovo, newItem, "Alteração recusada");
  if (oldItem && oldItem.id !== newItem.id) await setItemSaldo(repo, user, oldItem, oldSaldoDepoisEstorno!);
  await setItemSaldo(repo, user, newItem, saldoNovo);
  await repo.update<RecordData>("movimentacoes", user.empresaId, id, { ...patch, item: newItem.data.codigo, saldoAnterior: base, saldoNovo }, actorOf(user));
  await audit(repo, user.empresaId, user, {
    acao: "editar", modulo: "movimentacoes", registroId: id,
    resumo: `Movimentação recalculada: ${String(mov.data.tipo)} ${String(mov.data.quantidade)} → ${String(next.tipo)} ${String(next.quantidade)} em ${String(newItem.data.codigo)} (saldo ${base} → ${saldoNovo})`,
  });
  return getRecord(repo, user.empresaId, "movimentacoes", id);
}

/** Consumo de matéria-prima: baixa a quantidade do lote. */
export async function consumeRawMaterial(repo: DataRepository, user: SessionUser, id: string, quantidade: number, documento?: string) {
  const lote = await repo.get<RecordData>("materia_prima", user.empresaId, id);
  if (!lote) throw new TRPCError({ code: "NOT_FOUND", message: "Lote não encontrado." });
  if (lote.data.status === "Quarentena" || lote.data.status === "Bloqueado") {
    throw new TRPCError({ code: "BAD_REQUEST", message: `Lote ${String(lote.data.lote)} está ${String(lote.data.status).toLowerCase()} e não pode ser consumido.` });
  }
  const atual = Number(lote.data.quantidade ?? 0) || 0;
  if (!(quantidade > 0)) throw new TRPCError({ code: "BAD_REQUEST", message: "Informe uma quantidade maior que zero." });
  if (quantidade > atual) throw new TRPCError({ code: "BAD_REQUEST", message: `Quantidade indisponível: saldo do lote é ${atual} kg.` });
  const novo = Math.round((atual - quantidade) * 1000) / 1000;
  await repo.update("materia_prima", user.empresaId, id, { quantidade: novo }, actorOf(user));
  await audit(repo, user.empresaId, user, { acao: "consumir", modulo: "materia_prima", registroId: id, resumo: `Saída de ${quantidade} kg do lote ${String(lote.data.lote)} (${atual} → ${novo})${documento ? ` · ${documento}` : ""}` });
  return getRecord(repo, user.empresaId, "materia_prima", id);
}

/** Totais por status e somas numéricas, calculados sobre os dados filtrados. */
export async function summarize(repo: DataRepository, empresaId: string, moduleKey: ModuleKey, query: ListQuery = {}) {
  const mod = MODULES[moduleKey];
  const { items } = await repo.list<RecordData>(moduleKey, empresaId, { filter: (data, record) => matches(mod, data, record, query) });
  const byStatus: Record<string, number> = {};
  const sumsByType: Record<string, number> = {};
  let sum = 0;
  const moneyField = mod.fields.find(field => field.type === "money")?.name;
  for (const item of items) {
    if (mod.statusField) {
      const status = String(item.data[mod.statusField] ?? "");
      byStatus[status] = (byStatus[status] ?? 0) + 1;
    }
    if (moneyField) {
      const value = Number(item.data[moneyField] ?? 0) || 0;
      sum += value;
      const tipo = String(item.data.tipo ?? "");
      sumsByType[tipo] = (sumsByType[tipo] ?? 0) + value;
    }
  }
  return { total: items.length, byStatus, sum: Math.round(sum * 100) / 100, sumsByType };
}

function formatCell(field: string, value: unknown): string | number {
  if (value === null || value === undefined) return "";
  if (field === "createdAt" || field === "updatedAt" || field === "dataHora") return formatCsvDate(String(value));
  if (typeof value === "number") return String(value).replace(".", ",");
  return String(value);
}

export async function exportCsv(repo: DataRepository, empresaId: string, moduleKey: ModuleKey, query: ListQuery = {}) {
  const mod = MODULES[moduleKey];
  // busca todas as páginas do filtro atual
  const first = await listRecords(repo, empresaId, moduleKey, { ...query, page: 1, pageSize: 100 });
  const all = [...first.items];
  for (let page = 2; page <= first.pages; page++) {
    all.push(...(await listRecords(repo, empresaId, moduleKey, { ...query, page, pageSize: 100 })).items);
  }
  const columns = Array.from(new Set([...mod.columns, ...mod.fields.map(field => field.name), "createdAt", "criadoPor"]));
  const headers = columns.map(column => (column === "criadoPor" ? "Criado por" : columnLabel(mod, column)));
  const rows = all.map(row => columns.map(column => formatCell(column, column === "progresso" ? `${row.progresso ?? 0}%` : row[column])));
  if (all.some(row => row.demo)) {
    headers.push("Demonstração");
    all.forEach((row, index) => rows[index].push(row.demo ? "sim" : ""));
  }
  const stamp = new Date().toISOString().slice(0, 10);
  return { filename: `${mod.key}-${stamp}.csv`, csv: toCsv(headers, rows), count: all.length };
}
