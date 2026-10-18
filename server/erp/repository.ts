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
  /** Desfaz a exclusão lógica (o registro volta às listas). */
  restore(collection: string, empresaId: string, id: string, actor?: Actor | null): Promise<boolean>;
  /** Busca sem filtro de empresa. Uso restrito a login/sessão (descobrir a empresa do usuário). */
  findGlobal<T = Record<string, unknown>>(collection: string, predicate: (data: T, record: StoredRecord<T>) => boolean): Promise<StoredRecord<T> | null>;
  /** Como findGlobal, mas devolve todos os registros que atendem (login por usuário/matrícula). */
  findAllGlobal<T = Record<string, unknown>>(collection: string, predicate: (data: T, record: StoredRecord<T>) => boolean): Promise<StoredRecord<T>[]>;
  /** Remoção física. Uso restrito a dados técnicos expirados (ex.: sessões vencidas). */
  purge(collection: string, predicate: (record: StoredRecord) => boolean): Promise<number>;
}

type Snapshot = { version: 1; collections: Record<string, StoredRecord[]>; /** último journal incluído (B-21) */ journal?: number };

/** Uma mudança no estado, para o journal append-only (B-21): o registro inteiro depois da mudança, ou ids removidos. */
export type Change = { op: "put"; c: string; row: StoredRecord } | { op: "del"; c: string; ids: string[] };

const clone = <T>(value: T): T => (value === undefined ? value : JSON.parse(JSON.stringify(value)));

export class MemoryRepository implements DataRepository {
  protected state: Snapshot = { version: 1, collections: {} };

  protected persist(_change: Change): void {
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
    this.persist({ op: "put", c: collection, row: record as StoredRecord });
    return clone(record);
  }

  async update<T>(collection: string, empresaId: string, id: string, patch: Partial<T>, actor: Actor | null = null): Promise<StoredRecord<T> | null> {
    const row = this.bucket(collection).find(item => item.id === id && item.empresaId === empresaId && !item.deletedAt);
    if (!row) return null;
    row.data = { ...(row.data as object), ...clone(patch) } as Record<string, unknown>;
    row.updatedAt = new Date().toISOString();
    row.updatedBy = actor;
    this.persist({ op: "put", c: collection, row });
    return clone(row) as StoredRecord<T>;
  }

  async softDelete(collection: string, empresaId: string, id: string, actor: Actor | null = null): Promise<boolean> {
    const row = this.bucket(collection).find(item => item.id === id && item.empresaId === empresaId && !item.deletedAt);
    if (!row) return false;
    row.deletedAt = new Date().toISOString();
    row.deletedBy = actor;
    this.persist({ op: "put", c: collection, row });
    return true;
  }

  async restore(collection: string, empresaId: string, id: string, actor: Actor | null = null): Promise<boolean> {
    const row = this.bucket(collection).find(item => item.id === id && item.empresaId === empresaId && item.deletedAt);
    if (!row) return false;
    row.deletedAt = null;
    row.deletedBy = null;
    row.updatedAt = new Date().toISOString();
    row.updatedBy = actor;
    this.persist({ op: "put", c: collection, row });
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
      const ids = rows.filter(row => predicate(row)).map(row => row.id);
      this.state.collections[collection] = keep;
      this.persist({ op: "del", c: collection, ids });
    }
    return removed;
  }
}

/**
 * Store em arquivo inválido (vazio, truncado, JSON quebrado ou sumido com backups ao lado).
 * O servidor NÃO começa uma instalação nova por cima: recusa subir e aponta o backup (B-05).
 */
export class StoreInvalidoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StoreInvalidoError";
  }
}

export type JsonFileRepositoryOptions = {
  /** Espera sem gravações antes de consolidar o snapshot (padrão 1 s). */
  debounceMs?: number;
  /** Consolida no máximo a cada N ms mesmo com gravações contínuas (padrão 10 s). */
  maxWaitMs?: number;
  /** Consolida antes se o journal passar deste tamanho (padrão 8 MB). */
  maxJournalBytes?: number;
  /** Intervalo mínimo entre cópias rotativas em backups/ (padrão 1 h). */
  backupIntervalMs?: number;
  /** Quantas cópias rotativas manter em backups/ (padrão 48). */
  backupKeep?: number;
  /** fsync a cada gravação confirmada (padrão: sim; INJETAFLOW_FSYNC=false desliga). */
  fsync?: boolean;
  /** Só lê (snapshot + journals) e nunca grava nada: erp:backup com o servidor no ar. */
  somenteLeitura?: boolean;
};

const JOURNAL_RE = /^(.+)\.journal\.(\d+)$/;
export const BACKUP_DIR = "backups";
/** Cópias rotativas automáticas: backups/<store>-auto-AAAAMMDD-HHMMSS.json (as manuais usam -manual-). */
const AUTO = "-auto-";

/** Lê e valida um snapshot. Nunca devolve "vazio" para um arquivo vazio ou truncado: lança. */
export function lerSnapshot(file: string): Snapshot {
  const raw = fs.readFileSync(file, "utf8");
  if (!raw.trim()) throw new StoreInvalidoError(`O arquivo de dados ${file} está vazio (${raw.length} bytes).`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new StoreInvalidoError(`O arquivo de dados ${file} está truncado ou não é JSON válido (${(error as Error).message}).`);
  }
  const snap = parsed as Partial<Snapshot> | null;
  if (!snap || typeof snap !== "object" || Array.isArray(snap)) throw new StoreInvalidoError(`O arquivo de dados ${file} não tem o formato esperado.`);
  if (!snap.collections || typeof snap.collections !== "object" || Array.isArray(snap.collections)) {
    throw new StoreInvalidoError(`O arquivo de dados ${file} não tem "collections".`);
  }
  for (const [name, rows] of Object.entries(snap.collections)) {
    if (!Array.isArray(rows)) throw new StoreInvalidoError(`O arquivo de dados ${file} tem a coleção "${name}" corrompida.`);
    for (const row of rows) {
      if (!row || typeof row !== "object" || typeof (row as StoredRecord).id !== "string" || typeof (row as StoredRecord).empresaId !== "string") {
        throw new StoreInvalidoError(`O arquivo de dados ${file} tem um registro corrompido na coleção "${name}".`);
      }
    }
  }
  return { version: 1, collections: snap.collections, ...(typeof snap.journal === "number" ? { journal: snap.journal } : {}) };
}

/** Backups disponíveis para um store (mais recente primeiro): o .bak e as cópias rotativas de backups/. */
export function listarBackups(filePath: string): string[] {
  const dir = path.join(path.dirname(filePath), BACKUP_DIR);
  const base = path.basename(filePath, ".json");
  const found: Array<{ file: string; mtime: number }> = [];
  const bak = `${filePath}.bak`;
  if (fs.existsSync(bak)) found.push({ file: bak, mtime: fs.statSync(bak).mtimeMs });
  if (fs.existsSync(dir)) {
    for (const name of fs.readdirSync(dir)) {
      if (!name.startsWith(`${base}-`) || !name.endsWith(".json")) continue;
      const file = path.join(dir, name);
      found.push({ file, mtime: fs.statSync(file).mtimeMs });
    }
  }
  return found.sort((a, b) => b.mtime - a.mtime || b.file.localeCompare(a.file)).map(item => item.file);
}

function mensagemRestaurar(filePath: string, motivo: string): string {
  const backups = listarBackups(filePath);
  return [
    motivo,
    "O servidor não vai começar uma instalação nova por cima disso, para não apagar os dados.",
    backups.length
      ? `Restaure o backup mais recente com: pnpm erp:restaurar-backup ${backups[0]}` +
        (backups.length > 1 ? ` (há ${backups.length} backups; liste com: pnpm erp:restaurar-backup --listar)` : "")
      : "Não há backup ao lado do arquivo. Restaure a partir da sua cópia externa (pnpm erp:restaurar-backup <arquivo>).",
  ].join("\n");
}

export function carimbo(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace("T", "-").replace(/\..+$/, "");
}

/** Hard link (instantâneo; o snapshot antigo nunca é reescrito, só substituído por rename) ou cópia. */
function linkOuCopia(from: string, to: string): void {
  try {
    fs.linkSync(from, to);
  } catch {
    fs.copyFileSync(from, to);
    fs.chmodSync(to, 0o600);
  }
}

/**
 * Repositório persistido em arquivo (B-05/B-21).
 *
 * - Cada gravação confirmada vai, de forma síncrona, para um journal append-only com fsync:
 *   quando a promessa resolve, a mudança está no disco (durabilidade) e nenhuma outra gravação
 *   se intercala (o Node não troca de tarefa no meio de I/O síncrono).
 * - O snapshot completo (injetaflow.json) é consolidado depois, de forma assíncrona, serializada
 *   e com debounce: escreve um temporário, fsync, guarda o snapshot anterior como backup
 *   (.bak + cópias rotativas em backups/) e só então faz o rename atômico.
 * - Ao abrir, um arquivo vazio, truncado ou sem "collections" NUNCA vira instalação nova: lança
 *   StoreInvalidoError com o caminho do backup para restaurar.
 */
export class JsonFileRepository extends MemoryRepository {
  private readonly dir: string;
  private readonly base: string;
  private readonly opts: Required<JsonFileRepositoryOptions>;
  private gen = 1;
  private fd: number | null = null;
  private journalBytes = 0;
  private dirty = false;
  private firstDirtyAt = 0;
  private timer: NodeJS.Timeout | null = null;
  private compacting: Promise<void> | null = null;
  private again = false;
  private lastBackupAt = 0;
  private closed = false;

  constructor(private readonly filePath: string, options: JsonFileRepositoryOptions = {}) {
    super();
    this.opts = {
      debounceMs: options.debounceMs ?? 1000,
      maxWaitMs: options.maxWaitMs ?? 10_000,
      maxJournalBytes: options.maxJournalBytes ?? 8 * 1024 * 1024,
      backupIntervalMs: options.backupIntervalMs ?? 60 * 60 * 1000,
      backupKeep: options.backupKeep ?? 48,
      fsync: options.fsync ?? process.env.INJETAFLOW_FSYNC !== "false",
      somenteLeitura: options.somenteLeitura ?? false,
    };
    this.dir = path.dirname(filePath);
    this.base = path.basename(filePath);
    fs.mkdirSync(this.dir, { recursive: true });

    const journals = this.journals();
    if (fs.existsSync(filePath)) {
      try {
        this.state = lerSnapshot(filePath);
      } catch (error) {
        if (error instanceof StoreInvalidoError) throw new StoreInvalidoError(mensagemRestaurar(filePath, error.message));
        throw error;
      }
    } else if (journals.length > 0 || listarBackups(filePath).length > 0) {
      throw new StoreInvalidoError(
        mensagemRestaurar(filePath, `O arquivo de dados ${filePath} não existe, mas há journal ou backups dele na pasta.`)
      );
    } else if (this.opts.somenteLeitura) {
      throw new StoreInvalidoError(`O arquivo de dados ${filePath} não existe.`);
    } else {
      // instalação nova de verdade: pasta sem store, sem journal e sem backup
      this.writeSnapshotSync(JSON.stringify({ version: 1, journal: 0, collections: {} }));
    }

    const included = this.state.journal ?? 0;
    let replayed = 0;
    for (const { gen, file } of journals) {
      if (gen > included) replayed += this.replay(file);
    }
    this.gen = Math.max(included, ...journals.map(j => j.gen)) + 1;
    this.lastBackupAt = this.newestBackupTime();
    if (replayed > 0 && !this.opts.somenteLeitura) this.markDirty();
  }

  /** Estado consolidado (snapshot + journals) em JSON, para backup. */
  exportar(): string {
    return JSON.stringify({ version: 1, collections: this.state.collections });
  }

  /** Caminho do arquivo principal. */
  get file(): string {
    return this.filePath;
  }

  protected override persist(change: Change): void {
    if (this.closed) throw new Error("Repositório fechado.");
    if (this.opts.somenteLeitura) throw new Error("Repositório aberto só para leitura.");
    const line = `${JSON.stringify(change)}\n`;
    if (this.fd === null) this.fd = fs.openSync(this.journalPath(this.gen), "a", 0o600);
    fs.writeSync(this.fd, line);
    if (this.opts.fsync) fs.fsyncSync(this.fd);
    this.journalBytes += Buffer.byteLength(line);
    this.markDirty();
  }

  /** Consolida o snapshot agora (aguarda a consolidação em andamento, se houver). */
  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.compacting) await this.compacting;
    if (this.dirty) await this.compact();
  }

  /** Consolida de forma síncrona e fecha o journal (saída do processo, CLIs, testes). */
  close(): void {
    if (this.closed) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.dirty && !this.compacting) {
      const { gen, json } = this.cutSnapshot();
      this.finishSnapshotSync(gen, json);
    }
    // com uma consolidação assíncrona em voo, o journal já gravado garante os dados no próximo início
    if (this.fd !== null) fs.closeSync(this.fd);
    this.fd = null;
    this.closed = true;
  }

  private markDirty(): void {
    if (!this.dirty) this.firstDirtyAt = Date.now();
    this.dirty = true;
    this.schedule();
  }

  private schedule(): void {
    if (this.closed) return;
    if (this.timer) clearTimeout(this.timer);
    const waited = Date.now() - this.firstDirtyAt;
    const delay = this.journalBytes >= this.opts.maxJournalBytes ? 0 : Math.max(0, Math.min(this.opts.debounceMs, this.opts.maxWaitMs - waited));
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.compact().catch(error => console.error("[store] falha ao consolidar o snapshot (os dados seguem no journal):", error));
    }, delay);
    this.timer.unref();
  }

  /** Parte síncrona: fotografa o estado e passa as próximas gravações para um journal novo. */
  private cutSnapshot(): { gen: number; json: string } {
    const gen = this.gen;
    const json = JSON.stringify({ ...this.state, version: 1, journal: gen });
    if (this.fd !== null) fs.closeSync(this.fd);
    this.fd = null;
    this.gen = gen + 1;
    this.journalBytes = 0;
    this.dirty = false;
    return { gen, json };
  }

  private compact(): Promise<void> {
    if (this.compacting) {
      this.again = true;
      return this.compacting;
    }
    if (!this.dirty) return Promise.resolve();
    const { gen, json } = this.cutSnapshot();
    this.compacting = (async () => {
      const tmp = `${this.filePath}.${process.pid}.tmp`;
      const handle = await fs.promises.open(tmp, "w", 0o600);
      try {
        await handle.writeFile(json);
        if (this.opts.fsync) await handle.sync();
      } finally {
        await handle.close();
      }
      this.backupAndSwap(tmp, gen);
    })().finally(() => {
      this.compacting = null;
      if (this.again || this.dirty) {
        this.again = false;
        if (this.dirty) this.schedule();
      }
    });
    return this.compacting;
  }

  private finishSnapshotSync(gen: number, json: string): void {
    const tmp = `${this.filePath}.${process.pid}.tmp`;
    const fd = fs.openSync(tmp, "w", 0o600);
    try {
      fs.writeSync(fd, json);
      if (this.opts.fsync) fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    this.backupAndSwap(tmp, gen);
  }

  /** Guarda o snapshot atual como backup e troca pelo novo (rename atômico); apaga journals já incluídos. */
  private backupAndSwap(tmp: string, gen: number): void {
    if (fs.existsSync(this.filePath)) {
      const bakTmp = `${this.filePath}.bak.${process.pid}.tmp`;
      fs.rmSync(bakTmp, { force: true });
      linkOuCopia(this.filePath, bakTmp);
      fs.renameSync(bakTmp, `${this.filePath}.bak`);
      this.rotateBackup();
    }
    fs.renameSync(tmp, this.filePath);
    for (const journal of this.journals()) {
      if (journal.gen <= gen) fs.rmSync(journal.file, { force: true });
    }
  }

  private rotateBackup(): void {
    const now = Date.now();
    if (now - this.lastBackupAt < this.opts.backupIntervalMs) return;
    const dir = path.join(this.dir, BACKUP_DIR);
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const name = `${path.basename(this.filePath, ".json")}${AUTO}${carimbo(new Date(now))}.json`;
    const target = path.join(dir, name);
    if (!fs.existsSync(target)) linkOuCopia(this.filePath, target);
    this.lastBackupAt = now;
    const prefix = `${path.basename(this.filePath, ".json")}${AUTO}`;
    const rotating = fs
      .readdirSync(dir)
      .filter(file => file.startsWith(prefix) && file.endsWith(".json"))
      .sort()
      .reverse();
    for (const old of rotating.slice(this.opts.backupKeep)) fs.rmSync(path.join(dir, old), { force: true });
  }

  private newestBackupTime(): number {
    const dir = path.join(this.dir, BACKUP_DIR);
    if (!fs.existsSync(dir)) return 0;
    const prefix = `${path.basename(this.filePath, ".json")}${AUTO}`;
    let newest = 0;
    for (const name of fs.readdirSync(dir)) {
      if (name.startsWith(prefix) && name.endsWith(".json")) newest = Math.max(newest, fs.statSync(path.join(dir, name)).mtimeMs);
    }
    return newest;
  }

  private writeSnapshotSync(json: string): void {
    const tmp = `${this.filePath}.${process.pid}.tmp`;
    const fd = fs.openSync(tmp, "w", 0o600);
    try {
      fs.writeSync(fd, json);
      if (this.opts.fsync) fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmp, this.filePath);
  }

  private journalPath(gen: number): string {
    return path.join(this.dir, `${this.base}.journal.${gen}`);
  }

  private journals(): Array<{ gen: number; file: string }> {
    return fs
      .readdirSync(this.dir)
      .map(name => {
        const match = JOURNAL_RE.exec(name);
        return match && match[1] === this.base ? { gen: Number(match[2]), file: path.join(this.dir, name) } : null;
      })
      .filter((item): item is { gen: number; file: string } => item !== null)
      .sort((a, b) => a.gen - b.gen);
  }

  /** Reaplica um journal. Só a última linha pode estar cortada (queda no meio da gravação): é ignorada. */
  private replay(file: string): number {
    const lines = fs.readFileSync(file, "utf8").split("\n");
    let applied = 0;
    lines.forEach((line, index) => {
      if (!line.trim()) return;
      let change: Change;
      try {
        change = JSON.parse(line) as Change;
      } catch {
        const isLast = lines.slice(index + 1).every(rest => !rest.trim());
        if (isLast) return; // gravação interrompida: nunca foi confirmada
        throw new StoreInvalidoError(mensagemRestaurar(this.filePath, `O journal ${file} está corrompido na linha ${index + 1}.`));
      }
      const bucket = (this.state.collections[change.c] ??= []);
      if (change.op === "put") {
        const at = bucket.findIndex(row => row.id === change.row.id);
        if (at >= 0) bucket[at] = change.row;
        else bucket.push(change.row);
      } else if (change.op === "del") {
        const ids = new Set(change.ids);
        this.state.collections[change.c] = bucket.filter(row => !ids.has(row.id));
      }
      applied += 1;
    });
    return applied;
  }
}
