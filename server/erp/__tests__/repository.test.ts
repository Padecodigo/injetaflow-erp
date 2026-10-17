import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { JsonFileRepository, MemoryRepository } from "../repository";

describe("repositório de dados", () => {
  it("B01: grava em arquivo e mantém os registros após reiniciar (equivale a F5/novo login)", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "injetaflow-"));
    const file = path.join(dir, "db.json");
    const repo = new JsonFileRepository(file);
    const created = await repo.insert("ordens", "emp-1", { codigo: "OP-0001", produto: "Tampa" });
    const reopened = new JsonFileRepository(file);
    const { items, total } = await reopened.list("ordens", "emp-1");
    expect(total).toBe(1);
    expect(items[0].id).toBe(created.id);
    expect(items[0].data).toEqual({ codigo: "OP-0001", produto: "Tampa" });
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
  });

  it("separa os dados por empresa_id", async () => {
    const repo = new MemoryRepository();
    const a = await repo.insert("estoque", "emp-a", { codigo: "X" });
    await repo.insert("estoque", "emp-b", { codigo: "Y" });
    expect((await repo.list("estoque", "emp-a")).total).toBe(1);
    expect(await repo.get("estoque", "emp-b", a.id)).toBeNull();
    expect(await repo.update("estoque", "emp-b", a.id, { codigo: "Z" })).toBeNull();
    expect(await repo.softDelete("estoque", "emp-b", a.id)).toBe(false);
  });

  it("exclusão lógica tira o registro da lista mas mantém no armazenamento", async () => {
    const repo = new MemoryRepository();
    const rec = await repo.insert("moldes", "e", { codigo: "M-1" });
    expect(await repo.softDelete("moldes", "e", rec.id, { id: "u", nome: "U" })).toBe(true);
    expect((await repo.list("moldes", "e")).total).toBe(0);
    const all = await repo.list("moldes", "e", { includeDeleted: true });
    expect(all.items[0].deletedAt).toBeTruthy();
    expect(all.items[0].deletedBy?.nome).toBe("U");
  });

  it("ordena do mais recente para o mais antigo e pagina", async () => {
    const repo = new MemoryRepository();
    for (let i = 1; i <= 25; i++) {
      await repo.insert("x", "e", { n: i });
      await new Promise(resolve => setTimeout(resolve, 1));
    }
    const page1 = await repo.list<{ n: number }>("x", "e", { offset: 0, limit: 10 });
    expect(page1.total).toBe(25);
    expect(page1.items[0].data.n).toBe(25);
    const page3 = await repo.list<{ n: number }>("x", "e", { offset: 20, limit: 10 });
    expect(page3.items).toHaveLength(5);
  });

  it("não aceita registro sem empresa", async () => {
    await expect(new MemoryRepository().insert("x", "", {})).rejects.toThrow();
  });
});
