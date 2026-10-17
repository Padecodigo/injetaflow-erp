import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

/**
 * Camada de dados do InjetaFlow.
 *
 * Toda leitura e escrita passa por esta interface e é sempre filtrada por
 * `empresaId`. A implementação atual grava um arquivo JSON numa pasta ignorada
 * pelo git (`.data/`). Para migrar para o Supabase basta criar outra classe que
 * implemente `DataRepository` (cada coleção vira uma tabela com coluna
 * `empresa_id` + RLS) e trocá-la em `server/erp/store.ts`.
 */

export type Actor = { id: string; nome: string; matricula?: string | null };

export type StoredRecord<T = Record<string, unknown>> = {
  id: string;
  empresaId: string;
  data: T;
  createdAt: string;
  updatedAt: string;
  createdBy?: Actor | null;
  updatedBy?: Actor | null;
  deletedAt?: string | null;
  deletedBy?: Actor | null;
  /** Dado de exemplo (demonstração), nunca dado real do cliente. */
  demo?: boolean;
};

export type ListOptions<T> = {
  filter?: (data: T, record: StoredRecord<T>) => boolean;
  includeDeleted?: boolean;
  sort?: (a: StoredRecord<T>, b: StoredRecord<T>) => number;
  offset?: number;
  limit?: number;
};

export type ListResult<T> = { items: StoredRecord<T>[]; total: number };

export interface DataRepository {
  list<T = Record<string, unknown>>(collection: string, empresaId: string, options?: ListOptions<T>): Promise<ListResult<T>>;
  get<T = Record<string, unknown>>(collection: string, empresaId: string, id: string, includeDeleted?: boolean): Promise<StoredRecord<T> | null>;
  insert<T = Record<string, unknown>>(collection: string, empresaId: string, data: T, meta?: { actor?: Actor | null; demo?: boolean }): Promise<StoredRecord<T>>;
  update<T = Record<string, unknown>>(collection: string, empresaId: string, id: string, patch: Partial<T>, actor?: Actor | null): Promise<StoredRecord<T> | null>;
  /** Exclusão lógica: o registro some das listas, mas continua guardado. */
  softDelete(collection: string, empresaId: string, id: string, actor?: Actor | null): Promise<boolean>;
  /** Busca sem filtro de empresa. Uso restrito a login/sessão (descobrir a empresa do usuário). */
  findGlobal<T = Record<string, unknown>>(collection: string, predicate: (data: T, record: StoredRecord<T>) => boolean): Promise<StoredRecord<T> | null>;
  /** Como findGlobal, mas devolve todos os registros que atendem (login por usuário/matrícula). */
  findAllGlobal<T = Record<string, unknown>>(collection: string, predicate: (data: T, record: StoredRecord<T>) => boolean): Promise<StoredRecord<T>[]>;
  /** Remoção física. Uso restrito a dados técnicos expirados (ex.: sessões vencidas). */
  purge(collection: string, predicate: (record: StoredRecord) => boolean): Promise<number>;
}

type Snapshot = { version: 1; collections: Record<string, StoredRecord[]> };

const clone = <T>(value: T): T => (value === undefined ? value : JSON.parse(JSON.stringify(value)));

export class MemoryRepository implements DataRepository {
  protected state: Snapshot = { version: 1, collections: {} };

  protected persist(): void {
    // memória: nada a gravar
  }

  protected bucket(collection: string): StoredRecord[] {
    if (!this.state.collections[collection]) this.state.collections[collection] = [];
    return this.state.collections[collection];
  }

  async list<T>(collection: string, empresaId: string, options: ListOptions<T> = {}): Promise<ListResult<T>> {
    let rows = (this.bucket(collection) as StoredRecord<T>[]).filter(
      row => row.empresaId === empresaId && (options.includeDeleted || !row.deletedAt)
    );
    if (options.filter) rows = rows.filter(row => options.filter!(row.data, row));
    const sorted = [...rows].sort(options.sort ?? ((a, b) => b.createdAt.localeCompare(a.createdAt)));
    const offset = Math.max(0, options.offset ?? 0);
    const sliced = options.limit === undefined ? sorted.slice(offset) : sorted.slice(offset, offset + options.limit);
    return { items: clone(sliced), total: rows.length };
  }

  async get<T>(collection: string, empresaId: string, id: string, includeDeleted = false): Promise<StoredRecord<T> | null> {
    const row = this.bucket(collection).find(item => item.id === id && item.empresaId === empresaId);
    if (!row || (row.deletedAt && !includeDeleted)) return null;
    return clone(row) as StoredRecord<T>;
  }

  async insert<T>(collection: string, empresaId: string, data: T, meta: { actor?: Actor | null; demo?: boolean } = {}): Promise<StoredRecord<T>> {
    if (!empresaId) throw new Error("empresaId obrigatório");
    const now = new Date().toISOString();
    const record: StoredRecord<T> = {
      id: randomUUID(),
      empresaId,
      data: clone(data),
      createdAt: now,
      updatedAt: now,
      createdBy: meta.actor ?? null,
      updatedBy: meta.actor ?? null,
      deletedAt: null,
      ...(meta.demo ? { demo: true } : {}),
    };
    this.bucket(collection).push(record as StoredRecord);
    this.persist();
    return clone(record);
  }

  async update<T>(collection: string, empresaId: string, id: string, patch: Partial<T>, actor: Actor | null = null): Promise<StoredRecord<T> | null> {
    const row = this.bucket(collection).find(item => item.id === id && item.empresaId === empresaId && !item.deletedAt);
    if (!row) return null;
    row.data = { ...(row.data as object), ...clone(patch) } as Record<string, unknown>;
    row.updatedAt = new Date().toISOString();
    row.updatedBy = actor;
    this.persist();
    return clone(row) as StoredRecord<T>;
  }

  async softDelete(collection: string, empresaId: string, id: string, actor: Actor | null = null): Promise<boolean> {
    const row = this.bucket(collection).find(item => item.id === id && item.empresaId === empresaId && !item.deletedAt);
    if (!row) return false;
    row.deletedAt = new Date().toISOString();
    row.deletedBy = actor;
    this.persist();
    return true;
  }

  async findGlobal<T>(collection: string, predicate: (data: T, record: StoredRecord<T>) => boolean): Promise<StoredRecord<T> | null> {
    const row = (this.bucket(collection) as StoredRecord<T>[]).find(item => !item.deletedAt && predicate(item.data, item));
    return row ? clone(row) : null;
  }

  async findAllGlobal<T>(collection: string, predicate: (data: T, record: StoredRecord<T>) => boolean): Promise<StoredRecord<T>[]> {
    return clone((this.bucket(collection) as StoredRecord<T>[]).filter(item => !item.deletedAt && predicate(item.data, item)));
  }

  async purge(collection: string, predicate: (record: StoredRecord) => boolean): Promise<number> {
    const rows = this.bucket(collection);
    const keep = rows.filter(row => !predicate(row));
    const removed = rows.length - keep.length;
    if (removed > 0) {
      this.state.collections[collection] = keep;
      this.persist();
    }
    return removed;
  }
}

/** Repositório persistido em arquivo JSON (gravação atômica: arquivo temporário + rename). */
export class JsonFileRepository extends MemoryRepository {
  constructor(private readonly filePath: string) {
    super();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, "utf8");
      if (raw.trim()) {
        const parsed = JSON.parse(raw) as Snapshot;
        if (parsed && parsed.collections) this.state = parsed;
      }
    }
  }

  protected override persist(): void {
    const tmp = `${this.filePath}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.state), { mode: 0o600 });
    fs.renameSync(tmp, this.filePath);
  }
}
