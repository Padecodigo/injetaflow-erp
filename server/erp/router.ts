import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, PASSWORD_MIN_MESSAGE, identifierKind, normalizeIdentifier, normalizeUsername } from "@shared/erp/account";
import { MODULE_KEYS, MODULES, hasPermission, type ModuleKey } from "@shared/erp/modules";
import { assertPermission, moduleProcedure, protectedProcedure, publicProcedure, router } from "../_core/trpc";
import type { TrpcContext } from "../_core/context";
import {
  authenticate, clearLoginFailures, clearSessionCookie, conferirSenhaAtual, createSession, destroySession, destroyUserSessions, hashUserPassword,
  findLoginCandidates, isLoginLocked, MAX_FAILURES_PER_ACCOUNT, MAX_FAILURES_PER_EMAIL, registerLoginFailure, setSessionCookie, toSessionUser, USERS,
} from "./auth";
import { AUTOR_LOGIN, actorOf, audit, type AuditEntry } from "./audit";
import { consumeRawMaterial, numericSchema, createRecord, deleteRecord, exportCsv, flatten, getRecord, listRecords, PONTO_IMUTAVEL, PONTO_SO_NO_RELOGIO, summarize, updateRecord, type RecordData } from "./records";
import type { StoredRecord } from "./repository";
import { historico, presenca, relatorio, relatorioCsv } from "./rh";
import { auditarNegacaoPonto, type RotaNegadaPonto } from "./ponto-negacoes";
import { dashboardSummary } from "./dashboard";
import { createUser, deleteUser, listUsers, updateOwnAccount, updateUser, userCreateSchema, userUpdateSchema } from "./users";
import { checkPublicRate, enviarSolicitacao, solicitacaoSchema } from "./publico";
import { publicEmpresaId } from "./store";
import { clientIp } from "./net";
import type { SessionUser, UserData } from "./types";
import type { DataRepository } from "./repository";
import { dataDeCalendarioValida, normalizeText, todayIso } from "./text";

const moduleKey = z.enum(MODULE_KEYS);
// B-13: além do formato, a data precisa existir no calendário
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida").refine(dataDeCalendarioValida, "Data inválida");

const listInput = z.object({
  module: moduleKey,
  search: z.string().max(200).optional(),
  filters: z.record(z.string(), z.string().max(200).optional()).optional(),
  dateFrom: dateStr.optional(),
  dateTo: dateStr.optional(),
  page: z.number().int().min(1).max(100000).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
  sortField: z.string().max(60).optional(),
  sortDir: z.enum(["asc", "desc"]).optional(),
});

function ipOf(ctx: TrpcContext): string {
  return clientIp(ctx.req);
}

const permOf = (key: ModuleKey) => MODULES[key].permission;

/** B-14: campos que `records.options` devolve: só os declarados num `ref` que aponta para o módulo. */
export function camposDeReferencia(module: ModuleKey): Set<string> {
  const campos = new Set<string>();
  for (const mod of Object.values(MODULES)) {
    for (const field of mod.fields) {
      if (field.ref?.module !== module) continue;
      campos.add(field.ref.field);
      if (field.ref.labelField) campos.add(field.ref.labelField);
    }
  }
  return campos;
}

/** B-07: exportações em massa ficam na trilha (quem, o quê, filtros e quantidade). */
async function auditarExportacao(ctx: { repo: DataRepository; user: SessionUser }, modulo: string, rotulo: string, count: number, filtros: Record<string, unknown>) {
  const usados = Object.entries(filtros)
    .flatMap(([key, value]) => (value && typeof value === "object" ? Object.entries(value).map(([k, v]) => [`${key}.${k}`, v] as const) : [[key, value] as const]))
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${key}=${String(value).slice(0, 60)}`);
  await audit(ctx.repo, ctx.user.empresaId, ctx.user, { acao: "exportar", modulo, resumo: `Exportação CSV de ${rotulo}: ${count} linha(s)${usados.length ? ` · filtros: ${usados.join(", ")}` : ""}` });
}

/** B-07: falha de login e bloqueio na trilha da(s) empresa(s) da conta (ou da empresa padrão), sem a senha. */
async function auditarFalhaLogin(repo: DataRepository, candidates: StoredRecord<UserData>[], acao: string, resumo: string) {
  const empresas = candidates.length ? Array.from(new Set(candidates.map(c => c.empresaId))) : [publicEmpresaId()];
  for (const empresaId of empresas) await audit(repo, empresaId, null, { autor: AUTOR_LOGIN, acao, modulo: "auth", resumo });
}

export const authRouter = router({
  me: publicProcedure.query(({ ctx }) => ctx.user),
  login: publicProcedure
    .input(z.object({
      // um único campo: e-mail, nome de usuário ou matrícula ("email" mantido por compatibilidade)
      identificador: z.string().trim().max(200).optional(),
      email: z.string().trim().max(200).optional(),
      password: z.string().min(1, "Informe a senha").max(200),
      // B-08: empresa do login (ex.: /login?empresa=empresa-b); sem ela, ver escoparEmpresa
      empresa: z.string().trim().max(80).regex(/^[a-z0-9][a-z0-9_-]*$/i, "Empresa inválida").optional().or(z.literal("").transform(() => undefined)),
    }).refine(value => Boolean((value.identificador || value.email || "").trim()), { message: "Informe o e-mail, usuário ou matrícula", path: ["identificador"] }))
    .mutation(async ({ ctx, input }) => {
      const identificador = normalizeIdentifier(input.identificador || input.email || "");
      // limite e bloqueio pelo identificador normalizado (por IP e global) e pela conta encontrada,
      // para que alternar e-mail/usuário/matrícula da mesma conta não multiplique as tentativas
      const escopo = input.empresa ? `${input.empresa}|` : "";
      const ipKey = `${ipOf(ctx)}|${escopo}${identificador}`;
      const idKey = `id|${escopo}${identificador}`;
      const candidates = await findLoginCandidates(ctx.repo, identificador, input.empresa);
      const accountKeys = candidates.map(c => `conta|${c.id}`);
      const limites: [string, number | undefined][] = [[ipKey, undefined], [idKey, MAX_FAILURES_PER_EMAIL], ...accountKeys.map(k => [k, MAX_FAILURES_PER_ACCOUNT] as [string, number])];
      const bloqueado = () => limites.some(([key, max]) => isLoginLocked(key, Date.now(), max));
      if (bloqueado()) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Muitas tentativas. Aguarde 15 minutos ou fale com o administrador." });
      }
      const user = await authenticate(ctx.repo, identificador, input.password, candidates);
      const descricao = `identificador "${identificador.slice(0, 80)}"${input.empresa ? ` (empresa ${input.empresa})` : ""} · IP ${ipOf(ctx)}`;
      if (user === "inativo") {
        await auditarFalhaLogin(ctx.repo, candidates, "login negado", `Login negado: usuário inativo · ${descricao}`);
        throw new TRPCError({ code: "FORBIDDEN", message: "Usuário inativo. Fale com o administrador para reativar o acesso." });
      }
      if (!user) {
        for (const key of [ipKey, idKey, ...accountKeys]) registerLoginFailure(key);
        await auditarFalhaLogin(ctx.repo, candidates, "login falhou", `Falha de login (credenciais inválidas) · ${descricao}`);
        if (bloqueado()) await auditarFalhaLogin(ctx.repo, candidates, "bloqueio", `Login bloqueado por 15 minutos após tentativas seguidas · ${descricao}`);
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Usuário, e-mail, matrícula ou senha inválidos." });
      }
      for (const key of [ipKey, idKey, `conta|${user.id}`]) clearLoginFailures(key);
      const { token, expiresAt } = await createSession(ctx.repo, user, ipOf(ctx));
      setSessionCookie(ctx.req, ctx.res, token, expiresAt);
      const fresh = await ctx.repo.get<UserData>(USERS, user.empresaId, user.id);
      const sessionUser = toSessionUser(fresh ?? user);
      const via = identifierKind(identificador) === "email" ? "e-mail" : normalizeUsername(sessionUser.username ?? "") === identificador ? "usuário" : "matrícula";
      await audit(ctx.repo, user.empresaId, sessionUser, { acao: "login", modulo: "auth", resumo: `Login de ${sessionUser.email} (via ${via})` });
      return sessionUser;
    }),
  logout: publicProcedure.mutation(async ({ ctx }) => {
    await destroySession(ctx.repo, ctx.sessionToken);
    clearSessionCookie(ctx.req, ctx.res);
    if (ctx.user) await audit(ctx.repo, ctx.user.empresaId, ctx.user, { acao: "logout", modulo: "auth", resumo: `Logout de ${ctx.user.email}` });
    return { success: true } as const;
  }),
  changePassword: protectedProcedure
    .input(z.object({
      atual: z.string({ error: "Informe a senha atual." }).min(1, "Informe a senha atual."),
      nova: z.string({ error: "Informe a nova senha." }).min(PASSWORD_MIN_LENGTH, `Nova senha: ${PASSWORD_MIN_MESSAGE}.`).max(PASSWORD_MAX_LENGTH, `Nova senha: máximo de ${PASSWORD_MAX_LENGTH} caracteres.`),
    }, { error: "Informe a senha atual e a nova senha." }))
    .mutation(async ({ ctx, input }) => {
      const record = await ctx.repo.get<UserData>(USERS, ctx.user.empresaId, ctx.user.id);
      if (!record) throw new TRPCError({ code: "BAD_REQUEST", message: "Senha atual incorreta." });
      // B-12: 5 senhas atuais erradas em 15 minutos → TOO_MANY_REQUESTS
      conferirSenhaAtual(record, input.atual, { code: "BAD_REQUEST", ausente: "Informe a senha atual." });
      if (input.atual === input.nova) throw new TRPCError({ code: "BAD_REQUEST", message: "A nova senha deve ser diferente da atual." });
      await ctx.repo.update<UserData>(USERS, ctx.user.empresaId, ctx.user.id, { senhaHash: hashUserPassword(input.nova) }, actorOf(ctx.user));
      await destroyUserSessions(ctx.repo, ctx.user.id, ctx.sessionToken ?? undefined);
      await audit(ctx.repo, ctx.user.empresaId, ctx.user, { acao: "senha", modulo: "auth", resumo: "Senha alterada pelo próprio usuário" });
      return { success: true } as const;
    }),
});

/**
 * P7-01/P7-03/P7-08: registra a tentativa (com deduplicação por usuário+rota, P7-02) e responde FORBIDDEN.
 * Em update/remove a matrícula-alvo vem da própria marcação, quando existe.
 */
async function negarPonto(ctx: { repo: DataRepository; user: SessionUser }, input: { rota: RotaNegadaPonto; alvo?: unknown; tipo?: unknown; registroId?: string }, message: string): Promise<never> {
  let { alvo, tipo } = input;
  if (input.registroId && alvo === undefined) {
    const marcacao = await ctx.repo.get<RecordData>("ponto", ctx.user.empresaId, input.registroId.slice(0, 80));
    if (marcacao) ({ matricula: alvo, tipo } = marcacao.data);
  }
  await auditarNegacaoPonto(ctx.repo, ctx.user, { rota: input.rota, alvo, tipo, registroId: input.registroId?.slice(0, 80) });
  throw new TRPCError({ code: "FORBIDDEN", message });
}

export const recordsRouter = router({
  list: protectedProcedure.input(listInput).query(async ({ ctx, input }) => {
    assertPermission(ctx.user, permOf(input.module), "ver");
    const { module, ...query } = input;
    return listRecords(ctx.repo, ctx.user.empresaId, module, query);
  }),
  get: protectedProcedure.input(z.object({ module: moduleKey, id: z.string().min(1) })).query(async ({ ctx, input }) => {
    assertPermission(ctx.user, permOf(input.module), "ver");
    return getRecord(ctx.repo, ctx.user.empresaId, input.module, input.id);
  }),
  options: protectedProcedure.input(z.object({ module: moduleKey, field: z.string().min(1).max(60), labelField: z.string().max(60).optional() })).query(async ({ ctx, input }) => {
    // opções de campos de referência: exige ver o módulo de origem OU editar algum módulo que referencie
    if (!hasPermission(ctx.user, permOf(input.module), "ver")) {
      const referencing = Object.values(MODULES).some(mod => mod.fields.some(f => f.ref?.module === input.module) && hasPermission(ctx.user, mod.permission, "editar"));
      if (!referencing) assertPermission(ctx.user, permOf(input.module), "ver");
    }
    // B-14: só campos declarados em algum `ref` para este módulo (nada de "constructor" ou campos internos)
    const permitidos = camposDeReferencia(input.module);
    const recusados = [input.field, input.labelField].filter((campo): campo is string => Boolean(campo) && !permitidos.has(campo!));
    if (recusados.length) throw new TRPCError({ code: "BAD_REQUEST", message: `Campo não disponível para opções: ${recusados.join(", ")}.` });
    const { items } = await ctx.repo.list<RecordData>(input.module, ctx.user.empresaId, { sort: (a, b) => String(a.data[input.field]).localeCompare(String(b.data[input.field]), "pt-BR", { numeric: true }) });
    return items.map(item => ({ value: String(item.data[input.field] ?? ""), label: input.labelField ? String(item.data[input.labelField] ?? "") : "", status: String(item.data.status ?? "") })).filter(option => option.value);
  }),
  summary: protectedProcedure.input(listInput.pick({ module: true, search: true, filters: true, dateFrom: true, dateTo: true })).query(async ({ ctx, input }) => {
    assertPermission(ctx.user, permOf(input.module), "ver");
    const { module, ...query } = input;
    return summarize(ctx.repo, ctx.user.empresaId, module, query);
  }),
  create: protectedProcedure.input(z.object({ module: moduleKey, data: z.record(z.string(), z.unknown()) })).mutation(async ({ ctx, input }) => {
    // P7-01: negação no ponto é auditada antes da checagem de permissão (vale também para quem não tem rh:editar)
    if (input.module === "ponto") await negarPonto(ctx, { rota: "records.create", alvo: input.data.matricula, tipo: input.data.tipo }, PONTO_SO_NO_RELOGIO);
    assertPermission(ctx.user, permOf(input.module), "editar");
    return createRecord(ctx.repo, ctx.user, input.module, input.data);
  }),
  update: protectedProcedure.input(z.object({ module: moduleKey, id: z.string().min(1), data: z.record(z.string(), z.unknown()) })).mutation(async ({ ctx, input }) => {
    // P7-08: tentativa de alterar marcação também fica na trilha (marcação é imutável, N11)
    if (input.module === "ponto") await negarPonto(ctx, { rota: "records.update", registroId: input.id }, PONTO_IMUTAVEL);
    assertPermission(ctx.user, permOf(input.module), "editar");
    return updateRecord(ctx.repo, ctx.user, input.module, input.id, input.data);
  }),
  remove: protectedProcedure.input(z.object({ module: moduleKey, id: z.string().min(1) })).mutation(async ({ ctx, input }) => {
    if (input.module === "ponto") await negarPonto(ctx, { rota: "records.remove", registroId: input.id }, PONTO_IMUTAVEL);
    assertPermission(ctx.user, permOf(input.module), "editar");
    return deleteRecord(ctx.repo, ctx.user, input.module, input.id);
  }),
  exportCsv: protectedProcedure.input(listInput.omit({ page: true, pageSize: true })).mutation(async ({ ctx, input }) => {
    assertPermission(ctx.user, permOf(input.module), "ver");
    const { module, ...query } = input;
    const result = await exportCsv(ctx.repo, ctx.user.empresaId, module, query);
    await auditarExportacao(ctx, module, MODULES[module].label, result.count, query);
    return result;
  }),
  consumirMateriaPrima: moduleProcedure("materia_prima", "editar")
    .input(z.object({ id: z.string().min(1), quantidade: numericSchema({ label: "Quantidade (kg)", min: 0.001 }), documento: z.string().max(120).optional() }))
    .mutation(({ ctx, input }) => consumeRawMaterial(ctx.repo, ctx.user, input.id, input.quantidade, input.documento)),
  searchAll: protectedProcedure.input(z.object({ q: z.string().trim().min(1).max(100) })).query(async ({ ctx, input }) => {
    type Hit = { module: string; route: string; moduleLabel: string; id: string; titulo: string; subtitulo: string };
    const grupos: Hit[][] = [];
    const termo = normalizeText(input.q);
    for (const key of MODULE_KEYS) {
      const mod = MODULES[key];
      if (!hasPermission(ctx.user, mod.permission, "ver")) continue;
      const { items } = await listRecords(ctx.repo, ctx.user.empresaId, key, { search: input.q, pageSize: 5 });
      const titleField = mod.autoCode?.field ?? mod.uniqueFields?.[0] ?? mod.columns[0];
      const hits = items.map(item => ({
        module: key, route: mod.route, moduleLabel: mod.label, id: item.id,
        titulo: String(item[titleField] ?? item.nome ?? ""),
        subtitulo: mod.searchFields.filter(f => f !== titleField).map(f => item[f]).filter(Boolean).slice(0, 2).join(" · "),
      }));
      // N13: quem digita o prefixo do código (SOL-, OP-...) vê esse módulo primeiro
      const prefixo = mod.autoCode ? normalizeText(mod.autoCode.prefix.replace(/-$/, "")) : null;
      if (!hits.length) continue;
      if (prefixo && termo.startsWith(prefixo)) grupos.unshift(hits);
      else grupos.push(hits);
    }
    if (hasPermission(ctx.user, "usuarios", "ver")) {
      const users = await listUsers(ctx.repo, ctx.user.empresaId, { search: input.q, pageSize: 5 });
      if (users.items.length) grupos.push(users.items.map(u => ({ module: "usuarios", route: "/usuarios", moduleLabel: "Usuários", id: u.id, titulo: u.nome, subtitulo: `${u.matricula} · ${u.perfil}` })));
    }
    // N13: distribui o limite entre os módulos (antes os últimos — como Solicitações — eram cortados)
    const results: Hit[] = [];
    const exatos = grupos.flat().filter(h => normalizeText(h.titulo) === termo);
    results.push(...exatos);
    for (let i = 0; results.length < 40 && grupos.some(g => g.length > i); i++) {
      for (const g of grupos) if (g[i] && !results.includes(g[i]) && results.length < 40) results.push(g[i]);
    }
    return results;
  }),
});

export const usuariosRouter = router({
  list: moduleProcedure("usuarios", "ver")
    .input(z.object({ search: z.string().max(200).optional(), perfil: z.string().max(60).optional(), status: z.string().max(60).optional(), setor: z.string().max(60).optional(), page: z.number().int().min(1).max(100000).optional(), pageSize: z.number().int().min(1).max(100).optional() }))
    .query(({ ctx, input }) => listUsers(ctx.repo, ctx.user.empresaId, input)),
  create: moduleProcedure("usuarios", "editar").input(userCreateSchema).mutation(({ ctx, input }) => createUser(ctx.repo, ctx.user, ctx.user.empresaId, input)),
  update: moduleProcedure("usuarios", "editar").input(z.object({ id: z.string().min(1), data: userUpdateSchema })).mutation(({ ctx, input }) => updateUser(ctx.repo, ctx.user, input.id, input.data, { sessionToken: ctx.sessionToken })),
  remove: moduleProcedure("usuarios", "editar").input(z.object({ id: z.string().min(1) })).mutation(({ ctx, input }) => deleteUser(ctx.repo, ctx.user, input.id)),
  exportCsv: moduleProcedure("usuarios", "ver").input(z.object({ search: z.string().max(200).optional(), perfil: z.string().max(60).optional(), status: z.string().max(60).optional() })).mutation(async ({ ctx, input }) => {
    const { toCsv } = await import("./csv");
    const all = await listUsers(ctx.repo, ctx.user.empresaId, { ...input, pageSize: 100 });
    const items = [...all.items];
    for (let page = 2; page <= all.pages; page++) items.push(...(await listUsers(ctx.repo, ctx.user.empresaId, { ...input, page, pageSize: 100 })).items);
    const csv = toCsv(["Nome", "E-mail", "Usuário", "Matrícula", "Setor", "Perfil", "Módulos", "Status", "Último acesso"], items.map(u => [u.nome, u.email, u.username ?? "", u.matricula, u.setor, u.perfil, u.perfil === "Administrador" ? "Todos" : Object.entries(u.permissoes).map(([k, v]) => `${k}:${v}`).join(", "), u.status, u.ultimoAcesso ?? ""]));
    await auditarExportacao(ctx, "usuarios", "Usuários (dados pessoais)", items.length, input);
    return { filename: `usuarios-${todayIso()}.csv`, csv, count: items.length };
  }),
});

const relatorioInput = z.object({ inicio: dateStr, fim: dateStr, matricula: z.string().max(40).optional() });

export const rhRouter = router({
  presenca: moduleProcedure("rh", "ver").input(z.object({ date: dateStr.optional() }).optional()).query(({ ctx, input }) => presenca(ctx.repo, ctx.user.empresaId, input?.date ?? todayIso())),
  // F0a/F0c (planos RH/Ponto v2 §2.2-c e v3 §7) + P7-02/P7-05 do aceite: a antiga rota `rh.registrarPonto` foi
  // REMOVIDA. O ERP não registra ponto (só o relógio oficial, o REP). Quem chamar recebe 403 com orientação
  // (errorFormatter em server/_core/trpc.ts), sem gravar nada.
  relatorio: moduleProcedure("rh", "ver").input(relatorioInput).query(({ ctx, input }) => relatorio(ctx.repo, ctx.user.empresaId, input)),
  relatorioCsv: moduleProcedure("rh", "ver").input(relatorioInput).mutation(async ({ ctx, input }) => {
    const result = await relatorioCsv(ctx.repo, ctx.user.empresaId, input);
    await auditarExportacao(ctx, "rh", "Relatório de ponto", result.count, input);
    return result;
  }),
  historico: moduleProcedure("rh", "ver").input(z.object({ matricula: z.string().min(1).max(40) })).query(({ ctx, input }) => historico(ctx.repo, ctx.user.empresaId, input.matricula)),
  // N07: gestor/RH analisa as ocorrências (aprovar ou recusar, com parecer e auditoria)
  ocorrencias: moduleProcedure("rh", "ver")
    .input(z.object({ status: z.enum(["Pendente", "Aprovada", "Recusada", "Cancelada"]).optional() }).optional())
    .query(async ({ ctx, input }) => {
      const { items } = await ctx.repo.list<RecordData>("ocorrencias", ctx.user.empresaId, { filter: data => !input?.status || data.status === input.status, limit: 500 });
      return items.map(flatten);
    }),
  analisarOcorrencia: moduleProcedure("rh", "editar")
    .input(z.object({ id: z.string().min(1), decisao: z.enum(["Aprovada", "Recusada"]), parecer: z.string().trim().max(1000).optional() }))
    .mutation(async ({ ctx, input }) => {
      const record = await ctx.repo.get<RecordData>("ocorrencias", ctx.user.empresaId, input.id);
      if (!record) throw new TRPCError({ code: "NOT_FOUND", message: "Ocorrência não encontrada." });
      if (record.data.status !== "Pendente") throw new TRPCError({ code: "BAD_REQUEST", message: `Esta ocorrência já está "${String(record.data.status)}".` });
      if (input.decisao === "Recusada" && !input.parecer) throw new TRPCError({ code: "BAD_REQUEST", message: "Informe o motivo da recusa no parecer." });
      // B-03: a autoria é do usuário (ID), não da matrícula, que pode ser trocada; a matrícula fica como reforço
      if (ehAutorDaOcorrencia(record, ctx.user) || normalizeText(record.data.matricula) === normalizeText(ctx.user.matricula)) throw new TRPCError({ code: "FORBIDDEN", message: "Você não pode analisar a sua própria ocorrência." });
      const updated = await ctx.repo.update<RecordData>("ocorrencias", ctx.user.empresaId, input.id, { status: input.decisao, parecer: input.parecer || undefined, analisadoPor: ctx.user.nome, analisadoEm: new Date().toISOString() }, actorOf(ctx.user));
      await audit(ctx.repo, ctx.user.empresaId, ctx.user, { acao: "editar", modulo: "ocorrencias", registroId: input.id, resumo: `Ocorrência ${input.decisao.toLowerCase()} (${String(record.data.tipo)} de ${String(record.data.nome)} em ${String(record.data.data)})${input.parecer ? `: ${input.parecer}` : ""}` });
      return flatten(updated!);
    }),
});

export const dashboardRouter = router({
  summary: moduleProcedure("dashboard", "ver").input(z.object({ periodo: z.enum(["hoje", "7d", "30d"]).default("hoje") }).optional()).query(({ ctx, input }) => dashboardSummary(ctx.repo, ctx.user.empresaId, input?.periodo ?? "hoje")),
});

const OCORRENCIA_TIPOS = ["Justificativa de ausência", "Atraso", "Esquecimento de batida", "Ajuste de ponto", "Observação"] as const;
const ocorrenciaInput = z.object({ tipo: z.enum(OCORRENCIA_TIPOS, { message: "Escolha o tipo da ocorrência." }), data: dateStr, descricao: z.string().trim().min(5, "Descreva a ocorrência (mínimo 5 caracteres).").max(2000) });

/**
 * B-03: a ocorrência pertence a quem a abriu (`usuarioId`, gravado desde esta versão, ou `createdBy`).
 * Só registros antigos, sem nenhum dos dois, caem na comparação por matrícula.
 */
export function ehAutorDaOcorrencia(record: Pick<StoredRecord<RecordData>, "data" | "createdBy">, user: SessionUser): boolean {
  const autor = (typeof record.data.usuarioId === "string" && record.data.usuarioId) || record.createdBy?.id;
  if (autor) return autor === user.id;
  return normalizeText(record.data.matricula) === normalizeText(user.matricula);
}

async function propriaPendente(ctx: { repo: DataRepository; user: SessionUser }, id: string) {
  const record = await ctx.repo.get<RecordData>("ocorrencias", ctx.user.empresaId, id);
  if (!record || !ehAutorDaOcorrencia(record, ctx.user)) throw new TRPCError({ code: "NOT_FOUND", message: "Ocorrência não encontrada." });
  if (record.data.status !== "Pendente") throw new TRPCError({ code: "BAD_REQUEST", message: `Esta ocorrência já está "${String(record.data.status)}" e não pode mais ser alterada.` });
  return record;
}

export const perfilRouter = router({
  resumo: protectedProcedure.query(async ({ ctx }) => {
    const hist = await historico(ctx.repo, ctx.user.empresaId, ctx.user.matricula);
    return { usuario: ctx.user, ...hist };
  }),
  // Meu perfil: o próprio usuário só troca o nome de usuário (senha em auth.changePassword).
  // Matrícula, perfil, setor e permissões são recusados no servidor (FORBIDDEN).
  atualizarConta: protectedProcedure
    .input(z.record(z.string(), z.unknown(), { error: "Informe o nome de usuário." }))
    .mutation(({ ctx, input }) => updateOwnAccount(ctx.repo, ctx.user, input)),
  // F0c (plano RH/Ponto v3 §7) + P7-02: `perfil.registrarPonto` também foi REMOVIDA (ver ROTAS_PONTO_REMOVIDAS).
  novaOcorrencia: protectedProcedure
    .input(ocorrenciaInput)
    .mutation(async ({ ctx, input }) => {
      const record = await ctx.repo.insert<RecordData>("ocorrencias", ctx.user.empresaId, { ...input, matricula: ctx.user.matricula, nome: ctx.user.nome, usuarioId: ctx.user.id, status: "Pendente" }, { actor: actorOf(ctx.user) });
      await audit(ctx.repo, ctx.user.empresaId, ctx.user, { acao: "criar", modulo: "ocorrencias", registroId: record.id, resumo: `${input.tipo} em ${input.data}` });
      return flatten(record);
    }),
  // N07: o colaborador acompanha, edita e cancela as próprias ocorrências enquanto estiverem pendentes
  minhasOcorrencias: protectedProcedure.query(async ({ ctx }) => {
    const { items } = await ctx.repo.list<RecordData>("ocorrencias", ctx.user.empresaId, { filter: (data, record) => ehAutorDaOcorrencia({ data, createdBy: record.createdBy }, ctx.user), limit: 200 });
    return items.map(flatten);
  }),
  editarOcorrencia: protectedProcedure
    .input(ocorrenciaInput.extend({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      await propriaPendente(ctx, id);
      const record = await ctx.repo.update<RecordData>("ocorrencias", ctx.user.empresaId, id, data, actorOf(ctx.user));
      await audit(ctx.repo, ctx.user.empresaId, ctx.user, { acao: "editar", modulo: "ocorrencias", registroId: id, resumo: `Ocorrência editada pelo colaborador: ${data.tipo} em ${data.data}` });
      return flatten(record!);
    }),
  cancelarOcorrencia: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const atual = await propriaPendente(ctx, input.id);
      const record = await ctx.repo.update<RecordData>("ocorrencias", ctx.user.empresaId, input.id, { status: "Cancelada", canceladaEm: new Date().toISOString() }, actorOf(ctx.user));
      await audit(ctx.repo, ctx.user.empresaId, ctx.user, { acao: "editar", modulo: "ocorrencias", registroId: input.id, resumo: `Ocorrência cancelada pelo colaborador: ${String(atual.data.tipo)} em ${String(atual.data.data)}` });
      return flatten(record!);
    }),
});

const configSchema = z.object({
  nomeExibicao: z.string().trim().min(2).max(120),
  unidade: z.string().trim().max(120).optional(),
  fusoHorario: z.string().trim().max(60),
  // N05: "" não vira 0; mesma regra numérica dos formulários
  metaProducaoDiaria: numericSchema({ label: "Meta de produção diária (peças)", integer: true }),
  metaRefugoPct: numericSchema({ label: "Meta de refugo (%)", max: 100 }),
});

export const configRouter = router({
  get: protectedProcedure.query(async ({ ctx }) => {
    const { items } = await ctx.repo.list<RecordData>("empresa_config", ctx.user.empresaId, { limit: 1 });
    return { empresaId: ctx.user.empresaId, nomeExibicao: "Wamovale", unidade: "São José dos Campos · SP", fusoHorario: "America/Sao_Paulo", metaProducaoDiaria: 0, metaRefugoPct: 3, ...(items[0]?.data ?? {}) } as z.infer<typeof configSchema> & { empresaId: string };
  }),
  update: moduleProcedure("configuracoes", "editar").input(configSchema).mutation(async ({ ctx, input }) => {
    const { items } = await ctx.repo.list<RecordData>("empresa_config", ctx.user.empresaId, { limit: 1 });
    if (items[0]) await ctx.repo.update("empresa_config", ctx.user.empresaId, items[0].id, input, actorOf(ctx.user));
    else await ctx.repo.insert("empresa_config", ctx.user.empresaId, input, { actor: actorOf(ctx.user) });
    // B-07: antes → depois também nas configurações
    const mudancas = Object.entries(input).filter(([key, value]) => String(items[0]?.data[key] ?? "") !== String(value ?? "")).map(([key, value]) => `${key}: ${String(items[0]?.data[key] ?? "(vazio)")} → ${String(value ?? "(vazio)")}`).join("; ");
    await audit(ctx.repo, ctx.user.empresaId, ctx.user, { acao: "editar", modulo: "configuracoes", resumo: `Dados da empresa atualizados${mudancas ? ` — ${mudancas}` : " (sem alterações)"}` });
    return { success: true } as const;
  }),
  auditoria: moduleProcedure("configuracoes", "ver").input(z.object({ search: z.string().max(200).optional(), page: z.number().int().min(1).optional(), pageSize: z.number().int().min(1).max(100).optional() })).query(async ({ ctx, input }) => {
    const page = input.page ?? 1;
    const pageSize = input.pageSize ?? 10;
    const needle = normalizeText(input.search);
    const { items, total } = await ctx.repo.list<AuditEntry>("auditoria", ctx.user.empresaId, {
      filter: data => !needle || normalizeText(`${data.acao} ${data.modulo} ${data.resumo} ${data.usuario}`).includes(needle),
      offset: (page - 1) * pageSize,
      limit: pageSize,
    });
    return { items: items.map(item => ({ id: item.id, createdAt: item.createdAt, ...item.data })), total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };
  }),
});

export const publicoRouter = router({
  enviarSolicitacao: publicProcedure.input(solicitacaoSchema).mutation(async ({ ctx, input }) => {
    checkPublicRate(ipOf(ctx));
    return enviarSolicitacao(ctx.repo, publicEmpresaId(), input);
  }),
});
