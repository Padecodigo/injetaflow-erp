import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

/** Utilitários dos testes de dados e operação (PR B): pasta de dados descartável, servidor real e CLIs. */
export const ROOT = path.resolve(__dirname, "../../..");
const TSX = path.join(ROOT, "node_modules", ".bin", "tsx");

export function pastaTemporaria(prefixo = "injetaflow-dados-"): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefixo));
}

export async function portaLivre(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address() as net.AddressInfo;
      srv.close(() => resolve(port));
    });
  });
}

function envLimpo(dir: string, extra: Record<string, string>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, INJETAFLOW_DATA_DIR: dir, ...extra };
  delete env.VITEST;
  delete env.VITEST_POOL_ID;
  delete env.VITEST_WORKER_ID;
  for (const k of ["INJETAFLOW_ADMIN_PASSWORD", "INJETAFLOW_ADMIN_USERNAME", "INJETAFLOW_SEED_DEMO", "INJETAFLOW_DEMO_PASSWORD"]) if (!(k in extra)) delete env[k];
  return env;
}

/** Roda uma CLI de tools/ e devolve status, stdout e stderr (sem lançar). */
export function rodarCli(script: string, args: string[], dir: string, extra: Record<string, string> = {}) {
  const out = spawnSync(TSX, [script, ...args], { cwd: ROOT, env: envLimpo(dir, { NODE_ENV: "development", ...extra }), encoding: "utf8", timeout: 60_000 });
  return { status: out.status, stdout: out.stdout, stderr: out.stderr };
}

export type ServidorReal = { proc: ChildProcess; porta: number; log: () => string; fim: Promise<number | null>; parar: (sinal?: NodeJS.Signals) => Promise<number | null> };

/** Sobe o servidor de verdade (server/_core/index.ts) em produção numa porta livre. */
export async function subirServidor(dir: string, extra: Record<string, string> = {}, esperarNoAr = true): Promise<ServidorReal> {
  const porta = await portaLivre();
  const proc = spawn(TSX, ["server/_core/index.ts"], {
    cwd: ROOT,
    env: envLimpo(dir, { NODE_ENV: "production", PORT: String(porta), INJETAFLOW_SEED_DEMO: "false", ...extra }),
    stdio: ["ignore", "pipe", "pipe"],
  });
  let saida = "";
  proc.stdout!.on("data", d => (saida += String(d)));
  proc.stderr!.on("data", d => (saida += String(d)));
  const fim = new Promise<number | null>(resolve => proc.once("exit", code => resolve(code)));
  const parar = async (sinal: NodeJS.Signals = "SIGTERM") => {
    if (proc.exitCode === null && proc.signalCode === null) proc.kill(sinal);
    return fim;
  };
  if (esperarNoAr) {
    const limite = Date.now() + 30_000;
    for (;;) {
      if (proc.exitCode !== null) throw new Error(`servidor saiu (${proc.exitCode}): ${saida}`);
      try {
        const res = await fetch(`http://127.0.0.1:${porta}/api/health`);
        if (res.ok) break;
      } catch {
        /* ainda subindo */
      }
      if (Date.now() > limite) {
        await parar("SIGKILL");
        throw new Error(`servidor não subiu: ${saida}`);
      }
      await new Promise(r => setTimeout(r, 150));
    }
  }
  return { proc, porta, log: () => saida, fim, parar };
}

/** Espera o processo terminar sozinho (servidor que deve recusar subir); null se passar do prazo. */
export function esperarSaida(srv: ServidorReal, ms = 30_000): Promise<number | null> {
  return Promise.race([srv.fim, new Promise<null>(r => setTimeout(() => r(null), ms))]);
}
