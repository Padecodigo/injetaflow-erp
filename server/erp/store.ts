import path from "node:path";
import { JsonFileRepository, MemoryRepository, type DataRepository } from "./repository";

let current: DataRepository | null = null;

export const DEFAULT_EMPRESA_ID = "wamovale";

/** Empresa que recebe os formulários do portal público. */
export function publicEmpresaId(): string {
  return process.env.INJETAFLOW_PUBLIC_EMPRESA || DEFAULT_EMPRESA_ID;
}

export function dataDir(): string {
  return path.resolve(process.env.INJETAFLOW_DATA_DIR || path.join(process.cwd(), ".data"));
}

export const STORE_FILE = "injetaflow.json";

export function storePath(dir = dataDir()): string {
  return path.join(dir, STORE_FILE);
}

/** Consolida o snapshot e fecha o journal na saída do processo (servidor e CLIs). */
function fecharNaSaida(repo: JsonFileRepository) {
  // prepend: roda antes de soltar a trava da pasta (registrada antes, ao subir)
  process.prependListener("exit", () => {
    try {
      repo.close();
    } catch (error) {
      console.error("[store] falha ao consolidar na saída (os dados seguem no journal):", error);
    }
  });
}

/** Repositório ativo. Em testes (`NODE_ENV=test`) usa memória por padrão. */
export function getRepository(): DataRepository {
  if (!current) {
    if (process.env.NODE_ENV === "test" && !process.env.INJETAFLOW_DATA_DIR) {
      current = new MemoryRepository();
    } else {
      const repo = new JsonFileRepository(storePath());
      fecharNaSaida(repo);
      current = repo;
    }
  }
  return current;
}

export function setRepository(repo: DataRepository | null): void {
  current = repo;
}
