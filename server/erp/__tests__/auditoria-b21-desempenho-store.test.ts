import fs from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { JsonFileRepository } from "../repository";
import { pastaTemporaria } from "./helpers-servidor-dados";

/**
 * B-21 (média): cada mutação regravava o arquivo inteiro de forma síncrona (2× por mutação: registro +
 * auditoria). Com ~17 MB, cada criação levava ~320 ms e travava o event loop; 20 criações paralelas, 5,4 s.
 * Correção: journal append-only (síncrono + fsync, então a gravação confirmada é durável) e snapshot
 * consolidado depois, assíncrono, serializado e com debounce. Medição completa: tools/bench-store.ts.
 */
const dirs: string[] = [];
const abertos: JsonFileRepository[] = [];
afterAll(() => {
  for (const r of abertos) r.close();
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
});

function storeGrande(n = 40_000) {
  const dir = pastaTemporaria("b21-");
  dirs.push(dir);
  const file = path.join(dir, "injetaflow.json");
  const now = new Date().toISOString();
  const rec = (i: number) => ({ id: `id-${i}`, empresaId: "e1", data: { codigo: `LF-${i}`, descricao: `Registro ${i} ${"x".repeat(200)}`, valor: i }, createdAt: now, updatedAt: now, createdBy: null, updatedBy: null, deletedAt: null });
  fs.writeFileSync(file, JSON.stringify({ version: 1, collections: { financeiro: Array.from({ length: n }, (_, i) => rec(i)) } }));
  return file;
}

describe("B-21: escrita não é O(tamanho do store)", () => {
  it("50 inserções num store com 40 mil registros levam menos de 1,5 s (teste proposto)", async () => {
    const repo = new JsonFileRepository(storeGrande());
    abertos.push(repo);
    const t0 = performance.now();
    for (let i = 0; i < 50; i++) await repo.insert("financeiro", "e1", { codigo: `N-${i}`, valor: i });
    expect(performance.now() - t0).toBeLessThan(1500);
  }, 60_000);

  it("20 mutações paralelas (registro + auditoria) terminam rápido e o event loop não trava", async () => {
    const file = storeGrande();
    const repo = new JsonFileRepository(file);
    abertos.push(repo);
    let maxLag = 0;
    let esperado = performance.now() + 5;
    const sonda = setInterval(() => {
      const n = performance.now();
      maxLag = Math.max(maxLag, n - esperado);
      esperado = n + 5;
    }, 5);
    const t0 = performance.now();
    await Promise.all(
      Array.from({ length: 20 }, async (_, i) => {
        const r = await repo.insert("financeiro", "e1", { codigo: `P-${i}` });
        await repo.insert("auditoria", "e1", { acao: "criar", registroId: r.id });
      })
    );
    const total = performance.now() - t0;
    await new Promise(r => setTimeout(r, 30));
    clearInterval(sonda);
    expect(total).toBeLessThan(500);
    expect(maxLag).toBeLessThan(250);
    // e tudo o que foi confirmado já está no disco, antes de qualquer consolidação
    const lido = new JsonFileRepository(file, { somenteLeitura: true });
    expect((await lido.list("financeiro", "e1", { limit: 1 })).total).toBe(40_020);
    expect((await lido.list("auditoria", "e1", { limit: 1 })).total).toBe(20);
  }, 60_000);

  it("a consolidação do snapshot é adiada (debounce) e agrupa várias gravações numa só regravação", async () => {
    const file = storeGrande(1000);
    const repo = new JsonFileRepository(file, { debounceMs: 200, maxWaitMs: 2000 });
    abertos.push(repo);
    const mtimeAntes = fs.statSync(file).mtimeMs;
    for (let i = 0; i < 30; i++) await repo.insert("financeiro", "e1", { codigo: `D-${i}` });
    expect(fs.statSync(file).mtimeMs).toBe(mtimeAntes); // nada regravado ainda
    await new Promise(r => setTimeout(r, 600));
    expect(fs.statSync(file).mtimeMs).toBeGreaterThan(mtimeAntes);
    expect(JSON.parse(fs.readFileSync(file, "utf8")).collections.financeiro).toHaveLength(1030);
    expect(fs.readdirSync(path.dirname(file)).filter(f => f.includes(".journal."))).toEqual([]); // journal já incorporado
  });
});
