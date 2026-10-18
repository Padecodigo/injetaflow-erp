/**
 * B-21: mede o custo de escrita do store num arquivo grande (~17 MB: 10k financeiro, 10k estoque,
 * 2k usuários, 30k auditoria), como na auditoria. Roda igual na main e neste branch (só API pública).
 *
 *   pnpm tsx tools/bench-store.ts [--registros 1]   (fator de escala; padrão 1)
 *
 * Cada "mutação" = insert do registro + insert da auditoria (como o ERP faz).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { JsonFileRepository } from "../server/erp/repository";

const escala = Number(process.argv[process.argv.indexOf("--registros") + 1]) || 1;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bench-store-"));
const file = path.join(dir, "injetaflow.json");
const agora = new Date().toISOString();
const linha = (i: number, data: Record<string, unknown>) => ({ id: `id-${i}`, empresaId: "wamovale", data, createdAt: agora, updatedAt: agora, createdBy: null, updatedBy: null, deletedAt: null });
const gerar = (n: number, f: (i: number) => Record<string, unknown>) => Array.from({ length: Math.round(n * escala) }, (_, i) => linha(i, f(i)));
fs.writeFileSync(
  file,
  JSON.stringify({
    version: 1,
    collections: {
      financeiro: gerar(10_000, i => ({ codigo: `LF-${i}`, descricao: `Lançamento ${i} ${"x".repeat(150)}`, valor: i * 1.5, vencimento: "2026-10-17", status: "Aberto" })),
      estoque: gerar(10_000, i => ({ codigo: `EST-${i}`, material: `Material ${i} ${"y".repeat(100)}`, saldo: i, unidade: "kg", status: "Normal" })),
      usuarios: gerar(2_000, i => ({ nome: `Pessoa ${i}`, email: `p${i}@ex.com`, senhaHash: "s".repeat(120), perfil: "Operador", permissoes: { producao: "editar" }, status: "Ativo" })),
      auditoria: gerar(30_000, i => ({ usuario: "Admin", acao: "editar", modulo: "estoque", resumo: `Item ${i} ${"z".repeat(120)}`, data: agora })),
    },
  })
);
const mb = (fs.statSync(file).size / 1024 / 1024).toFixed(1);

async function main() {
  const t0 = performance.now();
  const repo = new JsonFileRepository(file);
  const abrir = performance.now() - t0;

  // atraso do event loop (o que um auth.me sentiria) enquanto as escritas rodam
  let maxLag = 0;
  let esperado = performance.now() + 5;
  const sonda = setInterval(() => {
    const n = performance.now();
    maxLag = Math.max(maxLag, n - esperado);
    esperado = n + 5;
  }, 5);

  const mutacao = async (i: number) => {
    const r = await repo.insert("financeiro", "wamovale", { codigo: `N-${i}`, descricao: "novo", valor: i });
    await repo.insert("auditoria", "wamovale", { usuario: "Bench", acao: "criar", modulo: "financeiro", registroId: r.id, resumo: `Lançamento N-${i}` });
  };
  const seqN = 50;
  const t1 = performance.now();
  for (let i = 0; i < seqN; i++) await mutacao(i);
  const seq = performance.now() - t1;
  await new Promise(r => setTimeout(r, 20));
  const lagSeq = maxLag;
  maxLag = 0;
  const t2 = performance.now();
  await Promise.all(Array.from({ length: 20 }, (_, i) => mutacao(1000 + i)));
  const par = performance.now() - t2;
  await new Promise(r => setTimeout(r, 20));
  const lagPar = maxLag;
  clearInterval(sonda);

  const comFlush = repo as unknown as { flush?: () => Promise<void>; close?: () => void };
  const t3 = performance.now();
  if (comFlush.flush) await comFlush.flush();
  const flush = performance.now() - t3;
  comFlush.close?.();

  // durabilidade: tudo que foi confirmado está no disco
  const relido = new JsonFileRepository(file);
  const total = (await relido.list("financeiro", "wamovale", { limit: 1 })).total;
  (relido as unknown as { close?: () => void }).close?.();
  fs.rmSync(dir, { recursive: true, force: true });

  console.log(
    JSON.stringify({
      storeMB: Number(mb),
      abrirMs: Math.round(abrir),
      mutacaoSequencialMediaMs: Number((seq / seqN).toFixed(2)),
      atrasoMaxEventLoopSequencialMs: Math.round(lagSeq),
      vintePararelasTotalMs: Math.round(par),
      atrasoMaxEventLoopParalelasMs: Math.round(lagPar),
      consolidarSnapshotMs: comFlush.flush ? Math.round(flush) : null,
      registrosDuraveis: total === Math.round(10_000 * escala) + seqN + 20,
    })
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
