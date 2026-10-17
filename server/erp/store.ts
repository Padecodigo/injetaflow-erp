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

/** Repositório ativo. Em testes (`NODE_ENV=test`) usa memória por padrão. */
export function getRepository(): DataRepository {
  if (!current) {
    current = process.env.NODE_ENV === "test" && !process.env.INJETAFLOW_DATA_DIR
      ? new MemoryRepository()
      : new JsonFileRepository(path.join(dataDir(), "injetaflow.json"));
  }
  return current;
}

export function setRepository(repo: DataRepository | null): void {
  current = repo;
}
