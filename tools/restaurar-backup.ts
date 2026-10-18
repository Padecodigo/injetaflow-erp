/**
 * B-05: restaura o store do ERP local a partir de um backup.
 *
 * Uso:
 *   pnpm erp:restaurar-backup --listar      lista os backups da pasta de dados (mais recente primeiro)
 *   pnpm erp:restaurar-backup <arquivo>     restaura esse arquivo
 *
 * Exige o servidor parado (B-04). Antes de trocar, guarda o estado atual em
 * backups/injetaflow-antes-da-restauracao-AAAAMMDD-HHMMSS.json (ou uma cópia bruta, se o atual estiver
 * corrompido): restaurar nunca apaga dados. O backup é validado antes; arquivo vazio ou truncado é recusado.
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { BACKUP_DIR, carimbo, JsonFileRepository, lerSnapshot, listarBackups, StoreInvalidoError } from "../server/erp/repository";
import { dataDir, storePath } from "../server/erp/store";
import { exigirServidorParado, PastaDeDadosEmUsoError } from "../server/erp/trava";

export function parseRestaurarBackupArgs(argv: string[]) {
  const args = argv.filter(a => a !== "--");
  if (args.includes("--listar") || args.includes("-l")) return { listar: true as const, arquivo: undefined };
  const desconhecido = args.find(a => a.startsWith("-"));
  if (desconhecido) throw new Error(`Argumento desconhecido: ${desconhecido}`);
  if (args.length !== 1) throw new Error("Informe o arquivo de backup a restaurar (ou --listar para ver os disponíveis).");
  return { listar: false as const, arquivo: path.resolve(args[0]) };
}

function gravarAtomico(destino: string, conteudo: string | Buffer) {
  const tmp = `${destino}.${process.pid}.tmp`;
  const fd = fs.openSync(tmp, "w", 0o600);
  try {
    fs.writeSync(fd, conteudo);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, destino);
}

function journalsDe(store: string): string[] {
  const dir = path.dirname(store);
  const base = path.basename(store);
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter(n => n.startsWith(`${base}.journal.`)).map(n => path.join(dir, n)) : [];
}

/** Guarda o estado atual (consolidado, ou bruto se estiver corrompido). Devolve os caminhos guardados. */
export function guardarEstadoAtual(store: string, agora = new Date()): string[] {
  const dir = path.join(path.dirname(store), BACKUP_DIR);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const nome = path.join(dir, `injetaflow-antes-da-restauracao-${carimbo(agora)}`);
  const guardados: string[] = [];
  if (fs.existsSync(store)) {
    try {
      const atual = new JsonFileRepository(store, { somenteLeitura: true });
      gravarAtomico(`${nome}.json`, atual.exportar());
      atual.close();
      guardados.push(`${nome}.json`);
      return guardados;
    } catch (error) {
      if (!(error instanceof StoreInvalidoError)) throw error;
      fs.copyFileSync(store, `${nome}.bruto`);
      fs.chmodSync(`${nome}.bruto`, 0o600);
      guardados.push(`${nome}.bruto`);
    }
  }
  journalsDe(store).forEach((journal, i) => {
    const copia = `${nome}.journal-${i + 1}.bruto`;
    fs.copyFileSync(journal, copia);
    fs.chmodSync(copia, 0o600);
    guardados.push(copia);
  });
  return guardados;
}

export function restaurarBackup(arquivo: string, store = storePath(), agora = new Date()) {
  if (!fs.existsSync(arquivo)) throw new Error(`Backup não encontrado: ${arquivo}`);
  const snap = lerSnapshot(arquivo); // vazio, truncado ou sem "collections": recusa antes de mexer em qualquer coisa
  const guardados = guardarEstadoAtual(store, agora);
  gravarAtomico(store, JSON.stringify({ version: 1, journal: 0, collections: snap.collections }));
  for (const journal of journalsDe(store)) fs.rmSync(journal, { force: true });
  const conferido = new JsonFileRepository(store, { somenteLeitura: true }); // abre como o servidor abriria
  conferido.close();
  const registros = Object.values(snap.collections).reduce((n, rows) => n + rows.length, 0);
  return { registros, guardados };
}

async function main() {
  const args = parseRestaurarBackupArgs(process.argv.slice(2));
  const store = storePath();
  if (args.listar) {
    const backups = listarBackups(store);
    if (!backups.length) return console.log(`Nenhum backup em ${path.dirname(store)}.`);
    console.log("Backups (mais recente primeiro):");
    for (const b of backups) console.log(`  ${b} · ${fs.statSync(b).mtime.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} (horário de Brasília) · ${fs.statSync(b).size} bytes`);
    return;
  }
  try {
    await exigirServidorParado(dataDir(), "erp:restaurar-backup");
  } catch (error) {
    if (error instanceof PastaDeDadosEmUsoError) {
      console.error(error.message);
      process.exit(2);
    }
    throw error;
  }
  const out = restaurarBackup(args.arquivo, store);
  console.log(`Backup restaurado: ${args.arquivo} → ${store} (${out.registros} registros).`);
  if (out.guardados.length) console.log(`O estado anterior foi guardado em: ${out.guardados.join(", ")}`);
  console.log("Pode subir o servidor.");
}

if (!process.env.VITEST) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
