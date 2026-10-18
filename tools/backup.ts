/**
 * B-05: cópia de segurança do store do ERP local.
 *
 * Uso:
 *   pnpm erp:backup                 grava <pasta de dados>/backups/injetaflow-manual-AAAAMMDD-HHMMSS.json
 *   pnpm erp:backup <arquivo.json>  grava no caminho indicado (ex.: um disco externo)
 *
 * Pode rodar com o servidor no ar: só lê (snapshot + journal) e nunca grava no store. O arquivo sai
 * com permissão 0600 (tem hashes de senha e dados pessoais). Para voltar: pnpm erp:restaurar-backup.
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { BACKUP_DIR, carimbo, JsonFileRepository, lerSnapshot } from "../server/erp/repository";
import { dataDir, storePath } from "../server/erp/store";

export function destinoDoBackup(argv: string[], dir = dataDir(), agora = new Date()): string {
  const args = argv.filter(a => a !== "--");
  if (args.some(a => a.startsWith("-"))) throw new Error(`Argumento desconhecido: ${args.find(a => a.startsWith("-"))}`);
  if (args.length > 1) throw new Error("Informe no máximo um arquivo de destino.");
  return args[0] ? path.resolve(args[0]) : path.join(dir, BACKUP_DIR, `injetaflow-manual-${carimbo(agora)}.json`);
}

export function fazerBackup(destino: string, origem = storePath()): { destino: string; registros: number } {
  const repo = new JsonFileRepository(origem, { somenteLeitura: true });
  const json = repo.exportar();
  repo.close();
  fs.mkdirSync(path.dirname(destino), { recursive: true, mode: 0o700 });
  if (fs.existsSync(destino)) throw new Error(`${destino} já existe; escolha outro nome.`);
  const tmp = `${destino}.${process.pid}.tmp`;
  const fd = fs.openSync(tmp, "w", 0o600);
  try {
    fs.writeSync(fd, json);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, destino);
  const conferido = lerSnapshot(destino); // relê do disco: o backup precisa abrir
  const registros = Object.values(conferido.collections).reduce((n, rows) => n + rows.length, 0);
  return { destino, registros };
}

async function main() {
  const destino = destinoDoBackup(process.argv.slice(2));
  const out = fazerBackup(destino);
  console.log(`Backup gravado: ${out.destino} (${out.registros} registros, permissão 0600).`);
  console.log(`Para restaurar (com o servidor parado): pnpm erp:restaurar-backup ${out.destino}`);
}

if (!process.env.VITEST) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
