import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * B-04: trava da pasta de dados. O servidor (e cada CLI que grava) segura `<dataDir>/injetaflow.lock`
 * enquanto roda. Com o servidor no ar, `erp:reset-senha`, `erp:restaurar-usuario` e
 * `erp:restaurar-backup` recusam com "pare o servidor antes", em vez de gravar algo que a memória do
 * servidor sobrescreveria (o reset "dava certo" e a senha antiga continuava valendo).
 */
export const LOCK_FILE = "injetaflow.lock";

export type InfoTrava = { pid: number; papel: "servidor" | "cli"; porta?: number; comando?: string; desde: string; host: string };

export class PastaDeDadosEmUsoError extends Error {
  constructor(readonly info: InfoTrava | null, message: string) {
    super(message);
    this.name = "PastaDeDadosEmUsoError";
  }
}

export function caminhoTrava(dir: string): string {
  return path.join(dir, LOCK_FILE);
}

/** Identificador da pasta de dados (hash do caminho real), para o servidor se identificar na porta. */
export function idDaPasta(dir: string): string {
  let real = path.resolve(dir);
  try {
    real = fs.realpathSync(dir);
  } catch {
    /* pasta ainda não existe */
  }
  return crypto.createHash("sha256").update(real).digest("hex").slice(0, 16);
}

export function processoVivo(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

export function lerTrava(dir: string): InfoTrava | null {
  try {
    const info = JSON.parse(fs.readFileSync(caminhoTrava(dir), "utf8")) as InfoTrava;
    return typeof info?.pid === "number" ? info : null;
  } catch {
    return null;
  }
}

/** Trava viva de OUTRO processo (a deste processo não conta; trava de pid morto é sobra de queda). */
export function travaAtiva(dir: string): InfoTrava | null {
  const info = lerTrava(dir);
  if (!info || info.pid === process.pid) return null;
  if (info.host && info.host !== os.hostname()) return info; // outra máquina com a mesma pasta: não dá para checar o pid
  return processoVivo(info.pid) ? info : null;
}

export function descreverTrava(info: InfoTrava): string {
  const quem = info.papel === "servidor" ? `o servidor (pid ${info.pid}${info.porta ? `, porta ${info.porta}` : ""})` : `outro comando (pid ${info.pid}${info.comando ? `: ${info.comando}` : ""})`;
  return `${quem}, desde ${info.desde}`;
}

/**
 * Pega a trava (criação exclusiva). Trava de processo morto é substituída. Devolve a função de soltar;
 * a trava também é solta na saída do processo.
 */
export function adquirirTrava(dir: string, dados: Omit<InfoTrava, "pid" | "desde" | "host">): () => void {
  fs.mkdirSync(dir, { recursive: true });
  const file = caminhoTrava(dir);
  const info: InfoTrava = { pid: process.pid, desde: new Date().toISOString(), host: os.hostname(), ...dados };
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    try {
      fs.writeFileSync(file, JSON.stringify(info), { flag: "wx", mode: 0o600 });
      const soltar = () => {
        if (lerTrava(dir)?.pid === process.pid) fs.rmSync(file, { force: true });
        process.removeListener("exit", soltar);
      };
      process.on("exit", soltar);
      return soltar;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const atual = travaAtiva(dir);
      if (atual) throw new PastaDeDadosEmUsoError(atual, `A pasta de dados ${dir} está em uso por ${descreverTrava(atual)}.`);
      if (lerTrava(dir)?.pid === process.pid) return () => undefined; // já é nossa
      fs.rmSync(file, { force: true }); // sobra de um processo que caiu
    }
  }
  throw new Error(`Não foi possível criar a trava ${file}.`);
}

/** O servidor desta pasta responde nesta porta? (o /api/health/dados devolve o id da pasta) */
export async function servidorNaPorta(dir: string, porta: number, timeoutMs = 1000): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${porta}/api/health/dados`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return false;
    const body = (await res.json()) as { dados?: string };
    return body.dados === idDaPasta(dir);
  } catch {
    return false;
  }
}

export const PARE_O_SERVIDOR = "Pare o servidor antes (Ctrl+C no terminal do pnpm dev / pnpm start, ou docker stop) e rode o comando de novo.";

/**
 * Para as CLIs que gravam: recusa com o servidor no ar (trava viva ou servidor desta pasta na porta)
 * e, se estiver livre, pega a trava para o servidor não subir no meio da gravação.
 */
export async function exigirServidorParado(dir: string, comando: string, porta = Number(process.env.PORT || 3000)): Promise<() => void> {
  const atual = travaAtiva(dir);
  if (atual) {
    throw new PastaDeDadosEmUsoError(atual, `A pasta de dados ${dir} está em uso por ${descreverTrava(atual)}. ${PARE_O_SERVIDOR} Nada foi alterado.`);
  }
  if (Number.isInteger(porta) && porta > 0 && (await servidorNaPorta(dir, porta))) {
    throw new PastaDeDadosEmUsoError(null, `O servidor desta pasta de dados está respondendo na porta ${porta}. ${PARE_O_SERVIDOR} Nada foi alterado.`);
  }
  try {
    return adquirirTrava(dir, { papel: "cli", comando });
  } catch (error) {
    if (error instanceof PastaDeDadosEmUsoError) throw new PastaDeDadosEmUsoError(error.info, `${error.message} ${PARE_O_SERVIDOR} Nada foi alterado.`);
    throw error;
  }
}
