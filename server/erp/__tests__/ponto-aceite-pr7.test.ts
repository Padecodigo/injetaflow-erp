import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PERFIL_PRESETS } from "@shared/erp/modules";
import { PONTO_SO_NO_RELOGIO } from "@shared/erp/ponto";
import { appRouter } from "../../routers";
import { MemoryRepository, type DataRepository } from "../repository";
import { getUserFromToken, readSessionToken, SESSION_COOKIE } from "../auth";
import { createAndLogin, setup } from "./helpers";
import { auditarNegacaoPonto, JANELA_NEGACAO_MS, resetNegacoesPonto, type NegacaoPontoEntry } from "../ponto-negacoes";
import { registrarPontoDemonstracao } from "../ponto-demonstracao";
import { ensureSeed, seedPontoDemo } from "../seed";

/**
 * Regressões do aceite do PR #7 (relatório relatorio-aceite-pr7-pr8.md): P7-01 a P7-08.
 * F0c (plano RH/Ponto v3, §7): o ERP não registra ponto; a origem oficial das marcações é o REP.
 */

async function negadas(repo: DataRepository, empresaId: string) {
  const { items } = await repo.list<NegacaoPontoEntry>("auditoria", empresaId, { filter: d => d.acao === "negado" });
  return items.map(i => ({ id: i.id, ...i.data }));
}

async function cenario() {
  resetNegacoesPonto();
  const ctx = await setup();
  for (const [matricula, nome] of [["MAT-0001", "Pessoa Um"], ["MAT-0002", "Pessoa Dois"]]) {
    await ctx.admin.caller.records.create({ module: "colaboradores", data: { matricula, nome, cargo: "Operador", setor: "Produção", turno: "1º turno (06–14)", status: "Ativo" } });
  }
  const gestor = await createAndLogin(ctx.repo, ctx.empresaId, { email: "gestor@teste.local", perfil: "Gestor", permissoes: PERFIL_PRESETS.Gestor, matricula: "MAT-0002" });
  const operador = await createAndLogin(ctx.repo, ctx.empresaId, { email: "op@teste.local", perfil: "Operador", permissoes: PERFIL_PRESETS.Operador, matricula: "MAT-0001" });
  const consulta = await createAndLogin(ctx.repo, ctx.empresaId, { email: "consulta@teste.local", perfil: "Consulta", permissoes: PERFIL_PRESETS.Consulta, matricula: "MAT-CONS" });
  return { ...ctx, gestor, operador, consulta };
}

describe("P7-01/P7-08: toda negação no módulo ponto é auditada (create, update, remove)", () => {
  it("create: auditado para Admin, Gestor, Operador e Consulta (mesmo sem rh:editar), com a orientação do REP", async () => {
    const { repo, empresaId, admin, gestor, operador, consulta } = await cenario();
    for (const quem of [admin, gestor, operador, consulta]) {
      await expect(quem.caller.records.create({ module: "ponto", data: { matricula: "MAT-0001", tipo: "Entrada" } })).rejects.toMatchObject({ code: "FORBIDDEN", message: PONTO_SO_NO_RELOGIO });
    }
    const linhas = await negadas(repo, empresaId);
    expect(linhas).toHaveLength(4);
    expect(new Set(linhas.map(l => l.usuarioId)).size).toBe(4);
    expect(linhas.every(l => l.rota === "records.create" && l.modulo === "rh" && l.suprimidasJanelaAnterior === 0 && l.alvo === "MAT-0001")).toBe(true);
    expect((await admin.caller.records.list({ module: "ponto" })).total).toBe(0);
  });

  it("update e remove: auditados com a matrícula da marcação; a marcação continua intacta", async () => {
    const { repo, empresaId, admin, operador } = await cenario();
    const marc = await registrarPontoDemonstracao(repo, (await admin.caller.auth.me())!, { matricula: "MAT-0002", tipo: "Entrada", demo: true });
    await expect(admin.caller.records.update({ module: "ponto", id: marc.id, data: { tipo: "Saída" } })).rejects.toMatchObject({ code: "FORBIDDEN", message: expect.stringMatching(/Portaria 671/) });
    await expect(admin.caller.records.remove({ module: "ponto", id: marc.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(operador.caller.records.remove({ module: "ponto", id: marc.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const linhas = await negadas(repo, empresaId);
    expect(linhas.map(l => l.rota).sort()).toEqual(["records.remove", "records.remove", "records.update"]);
    const upd = linhas.find(l => l.rota === "records.update")!;
    expect(upd).toMatchObject({ registroId: marc.id, alvo: "MAT-0002" });
    expect(upd.resumo).toMatch(/Tentativa de alterar marcação de ponto \(Entrada\) pelo ERP \(em nome de outra pessoa, matrícula MAT-0002\)/);
    const doOperador = linhas.find(l => l.rota === "records.remove" && l.matricula === "MAT-0001")!;
    expect(doOperador.resumo).toMatch(/excluir .*outra pessoa, matrícula MAT-0002/);
    const lista = await admin.caller.records.list({ module: "ponto" });
    expect(lista.items[0]).toMatchObject({ id: marc.id, tipo: "Entrada" });
  });
});

describe("P7-03: resumo distingue o próprio ponto de outra pessoa e registra a matrícula-alvo", () => {
  it("operador MAT-0001: próprio × MAT-0002", async () => {
    const { repo, empresaId, operador, gestor } = await cenario();
    await expect(operador.caller.records.create({ module: "ponto", data: { matricula: "mat-0001", tipo: "Entrada" } })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(gestor.caller.records.create({ module: "ponto", data: { matricula: "MAT-0001", tipo: "Saída" } })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const linhas = await negadas(repo, empresaId);
    const op = linhas.find(l => l.matricula === "MAT-0001")!;
    const ge = linhas.find(l => l.matricula === "MAT-0002")!;
    expect(op.resumo).toMatch(/\(Entrada\) pelo ERP \(o próprio ponto, matrícula MAT-0001\)/);
    expect(op.resumo).not.toMatch(/outra pessoa/);
    expect(op.alvo).toBe("MAT-0001");
    expect(ge.resumo).toMatch(/\(Saída\) pelo ERP \(em nome de outra pessoa, matrícula MAT-0001\)/);
  });

  it("valores longos ou com quebra de linha são truncados e limpos", async () => {
    const { repo, empresaId, admin } = await cenario();
    await expect(admin.caller.records.create({ module: "ponto", data: { matricula: `X\n${"A".repeat(5000)}`, tipo: { $ne: 1 } } })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const [linha] = await negadas(repo, empresaId);
    expect(linha.alvo).toHaveLength(40);
    expect(linha.resumo).not.toMatch(/\n/);
    expect(linha.resumo.length).toBeLessThan(260);
  });
});

describe("P7-02 / P7-R2-02: limite contra inflação, com auditoria append-only", () => {
  it("50 tentativas na janela = 1 entrada; nenhuma entrada é editada; outra rota abre outra entrada", async () => {
    const { repo, empresaId, consulta, operador } = await cenario();
    const spy = vi.spyOn(repo, "update");
    const updatesDeAuditoria = () => spy.mock.calls.filter(c => c[0] === "auditoria");
    for (let i = 0; i < 50; i++) {
      await expect(consulta.caller.records.create({ module: "ponto", data: { matricula: `MAT-${i % 15}`, tipo: "Entrada" } })).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    let linhas = await negadas(repo, empresaId);
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({ rota: "records.create", alvo: "MAT-0", suprimidasJanelaAnterior: 0 });
    expect(linhas[0].resumo).toMatch(/^Tentativa de registrar ponto \(Entrada\) pelo ERP \(em nome de outra pessoa, matrícula MAT-0\)/);
    expect(updatesDeAuditoria()).toEqual([]); // append-only: nunca atualiza auditoria
    await expect(operador.caller.records.remove({ module: "ponto", id: "nao-existe" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    linhas = await negadas(repo, empresaId);
    expect(linhas).toHaveLength(2);
    expect(updatesDeAuditoria()).toEqual([]);
  });

  it("50 tentativas em paralelo também viram 1 entrada", async () => {
    const { repo, empresaId, operador } = await cenario();
    await Promise.allSettled(Array.from({ length: 50 }, () => operador.caller.records.create({ module: "ponto", data: { matricula: "MAT-0001", tipo: "Entrada" } })));
    const linhas = await negadas(repo, empresaId);
    expect(linhas).toHaveLength(1);
  });

  it("na janela seguinte grava entrada nova informando as suprimidas da anterior; cada entrada tem o próprio resumo e alvo", async () => {
    const { repo, empresaId, operador } = await cenario();
    const user = (await operador.caller.auth.me())!; // matrícula MAT-0001
    const t0 = new Date("2026-10-17T12:00:00Z");
    const em = (ms: number) => new Date(t0.getTime() + ms);
    expect(await auditarNegacaoPonto(repo, user, { rota: "records.create", alvo: "MAT-0001" }, t0)).toMatchObject({ gravada: true, suprimidasJanelaAnterior: 0 });
    for (let i = 1; i <= 7; i++) {
      expect(await auditarNegacaoPonto(repo, user, { rota: "records.create", alvo: `MAT-90${i}` }, em(i * 1000))).toMatchObject({ gravada: false, suprimidasNaJanela: i });
    }
    expect(await auditarNegacaoPonto(repo, user, { rota: "records.create", alvo: "MAT-0002" }, em(JANELA_NEGACAO_MS - 1))).toMatchObject({ gravada: false, suprimidasNaJanela: 8 });
    // janela seguinte: nova entrada, com a contagem da anterior e o resumo DESTA tentativa (outra pessoa)
    expect(await auditarNegacaoPonto(repo, user, { rota: "records.create", alvo: "MAT-0002", tipo: "Saída" }, em(JANELA_NEGACAO_MS))).toMatchObject({ gravada: true, suprimidasJanelaAnterior: 8 });
    // terceira janela, sem suprimidas na segunda
    expect(await auditarNegacaoPonto(repo, user, { rota: "records.create", alvo: "MAT-0001" }, em(3 * JANELA_NEGACAO_MS))).toMatchObject({ gravada: true, suprimidasJanelaAnterior: 0 });
    const linhas = (await negadas(repo, empresaId)).sort((a, b) => a.janelaInicio.localeCompare(b.janelaInicio));
    expect(linhas.map(l => [l.alvo, l.suprimidasJanelaAnterior])).toEqual([["MAT-0001", 0], ["MAT-0002", 8], ["MAT-0001", 0]]);
    expect(linhas[0].resumo).toMatch(/o próprio ponto, matrícula MAT-0001/);
    expect(linhas[1].resumo).toMatch(/\(Saída\) pelo ERP \(em nome de outra pessoa, matrícula MAT-0002\).*· 8 tentativa\(s\) desta rota suprimida\(s\) na janela anterior/);
    expect(linhas[2].resumo).toMatch(/o próprio ponto/);
    expect(linhas[2].resumo).not.toMatch(/suprimida/);
  });

  it("a chave é empresa + usuário + rota: outro usuário ou outra rota não é suprimido", async () => {
    const { repo, empresaId, operador, gestor } = await cenario();
    const op = (await operador.caller.auth.me())!;
    const ge = (await gestor.caller.auth.me())!;
    const t0 = new Date("2026-10-17T12:00:00Z");
    await auditarNegacaoPonto(repo, op, { rota: "records.create", alvo: "MAT-0001" }, t0);
    expect(await auditarNegacaoPonto(repo, ge, { rota: "records.create", alvo: "MAT-0001" }, t0)).toMatchObject({ gravada: true });
    expect(await auditarNegacaoPonto(repo, op, { rota: "records.update", alvo: "MAT-0001" }, t0)).toMatchObject({ gravada: true });
    expect(await auditarNegacaoPonto(repo, { ...op, empresaId: "empresa-b" }, { rota: "records.create", alvo: "MAT-0001" }, t0)).toMatchObject({ gravada: true });
    expect(await negadas(repo, empresaId)).toHaveLength(3);
  });
});

describe("P7-02: rotas registrarPonto removidas respondem 403 claro pela API HTTP, sem gravar nada", () => {
  let server: Server;
  let base = "";
  let repo: MemoryRepository;
  let cookieAdmin = "";
  let cookieOperador = "";
  let empresaId = "";

  beforeAll(async () => {
    const ctx = await cenario();
    repo = ctx.repo;
    empresaId = ctx.empresaId;
    cookieAdmin = `${SESSION_COOKIE}=${ctx.admin.token}`;
    cookieOperador = `${SESSION_COOKIE}=${ctx.operador.token}`;
    const app = express();
    app.use(express.json());
    app.use("/api/trpc", createExpressMiddleware({
      router: appRouter,
      createContext: async ({ req, res }) => {
        const sessionToken = readSessionToken(req);
        return { req, res, repo, sessionToken, user: await getUserFromToken(repo, sessionToken) };
      },
    }));
    server = createServer(app);
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>(resolve => server.close(() => resolve())));

  const post = (path: string, json: unknown, cookie?: string) =>
    fetch(`${base}/api/trpc/${path}`, { method: "POST", headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: JSON.stringify({ json }) });

  it("rh.registrarPonto e perfil.registrarPonto: 403 FORBIDDEN com a orientação do relógio oficial (admin, operador e sem sessão)", async () => {
    for (const cookie of [cookieAdmin, cookieOperador, undefined]) {
      for (const path of ["rh.registrarPonto", "perfil.registrarPonto"]) {
        const r = await post(path, { matricula: "MAT-0002", tipo: "Entrada", origem: "GPS" }, cookie);
        expect(r.status, path).toBe(403);
        const body = (await r.json()) as { error: { json: { message: string; data: { code: string; rotaRemovida?: boolean } } } };
        expect(body.error.json.message).toBe(PONTO_SO_NO_RELOGIO);
        expect(body.error.json.data).toMatchObject({ code: "FORBIDDEN", rotaRemovida: true });
      }
    }
    // não grava marcação nem auditoria: não há como inflar o log por essas rotas
    expect((await repo.list("ponto", empresaId)).total).toBe(0);
    expect(await negadas(repo, empresaId)).toHaveLength(0);
  });

  it("em lote (?batch=1) as duas rotas também respondem 403", async () => {
    const r = await fetch(`${base}/api/trpc/rh.registrarPonto,perfil.registrarPonto?batch=1`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieAdmin },
      body: JSON.stringify({ 0: { json: {} }, 1: { json: {} } }),
    });
    expect(r.status).toBe(403);
    const body = (await r.json()) as { error: { json: { message: string } } }[];
    expect(body.map(b => b.error.json.message)).toEqual([PONTO_SO_NO_RELOGIO, PONTO_SO_NO_RELOGIO]);
  });

  it("uma rota inexistente qualquer continua com 404 genérico (o tratamento é só para as rotas de ponto removidas)", async () => {
    const r = await post("rh.naoExiste", {}, cookieAdmin);
    expect(r.status).toBe(404);
  });
});

describe("P7-05/P7-07: gravador de demonstração e seed", () => {
  it("registrarPontoDemonstracao recusa sem demo: true", async () => {
    const { repo, admin } = await cenario();
    const user = (await admin.caller.auth.me())!;
    await expect(registrarPontoDemonstracao(repo, user, { matricula: "MAT-0001", tipo: "Entrada" } as never)).rejects.toThrow(/demonstração/);
    await expect(registrarPontoDemonstracao(repo, user, { matricula: "MAT-0001", tipo: "Entrada", demo: "true" } as never)).rejects.toThrow(/demonstração/);
    expect((await admin.caller.records.list({ module: "ponto" })).total).toBe(0);
  });

  it("seed em produção não grava ponto; fora de produção grava só origem Demonstração, de forma determinística (P7-04)", async () => {
    const prod = new MemoryRepository();
    const r1 = await ensureSeed(prod, { empresaId: "e1", log: () => undefined, env: { NODE_ENV: "production", INJETAFLOW_ADMIN_PASSWORD: "Senha-Prod-1234" } });
    expect(r1.demoSeeded).toBe(true);
    expect((await prod.list("ponto", "e1")).total).toBe(0);

    for (const hora of ["2026-10-17T00:30:00", "2026-10-17T05:00:00", "2026-10-17T23:00:00"]) {
      const dev = new MemoryRepository();
      await ensureSeed(dev, { empresaId: "e1", log: () => undefined, env: { NODE_ENV: "production", INJETAFLOW_ADMIN_PASSWORD: "Senha-Dev-1234" } });
      const actor = { id: "seed", empresaId: "e1", nome: "Carga de demonstração", email: "", setor: "Administrativo", perfil: "Administrador", matricula: "DEMO", permissoes: {}, status: "Ativo" } as const;
      await seedPontoDemo(dev, actor as never, new Date(hora));
      const { items } = await dev.list<Record<string, unknown>>("ponto", "e1");
      // sempre há as marcações fixas de ontem, qualquer que seja a hora (antes das 06:00 inclusive)
      expect(items.length, hora).toBeGreaterThanOrEqual(9);
      expect(items.every(i => i.data.origem === "Demonstração" && i.demo === true)).toBe(true);
      expect(items.some(i => i.data.validacao === "DIVERGENTE" && i.data.foraDeSequencia === true)).toBe(true);
      expect(items.every(i => !["GPS", "Rede local", "Manual"].includes(String(i.data.origem)))).toBe(true);
    }

    const dev = new MemoryRepository();
    await ensureSeed(dev, { empresaId: "e1", log: () => undefined, env: { NODE_ENV: "development", INJETAFLOW_ADMIN_PASSWORD: "Senha-Dev-1234" } });
    expect((await dev.list("ponto", "e1")).total).toBeGreaterThanOrEqual(9);
    // P7-R2-03: NODE_ENV ausente (o servidor roda como produção) não semeia; =1 explícito semeia
    const semEnv = new MemoryRepository();
    await ensureSeed(semEnv, { empresaId: "e1", log: () => undefined, env: { INJETAFLOW_ADMIN_PASSWORD: "Senha-Dev-1234" } });
    expect((await semEnv.list("ponto", "e1")).total).toBe(0);
    const explicito = new MemoryRepository();
    await ensureSeed(explicito, { empresaId: "e1", log: () => undefined, env: { INJETAFLOW_SEED_DEMO_PONTO: "1", INJETAFLOW_ADMIN_PASSWORD: "Senha-Dev-1234" } });
    expect((await explicito.list("ponto", "e1")).total).toBeGreaterThanOrEqual(9);
  });
});
