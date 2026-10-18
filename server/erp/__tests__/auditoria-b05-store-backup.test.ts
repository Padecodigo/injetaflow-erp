import fs from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { JsonFileRepository, listarBackups, StoreInvalidoError } from "../repository";
import { destinoDoBackup, fazerBackup } from "../../../tools/backup";
import { parseRestaurarBackupArgs, restaurarBackup } from "../../../tools/restaurar-backup";
import { caminhoTrava } from "../trava";
import { esperarSaida, pastaTemporaria, rodarCli, subirServidor } from "./helpers-servidor-dados";

/**
 * B-05 (alta): store vazio (0 bytes, disco cheio) ou JSON sem "collections" virava instalação nova
 * (admin + demo recriados, e a próxima escrita apagava a chance de recuperar); store truncado derrubava
 * o servidor; não havia backup. Correção: journal com fsync + snapshot atômico (tmp + rename) com
 * backup rotativo antes de trocar; store inválido recusa subir e aponta o backup; erp:backup e
 * erp:restaurar-backup.
 */
const dirs: string[] = [];
const abertos: JsonFileRepository[] = [];
afterAll(() => {
  for (const r of abertos) r.close();
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
});
const store = () => {
  const d = pastaTemporaria("b05-");
  dirs.push(d);
  return path.join(d, "injetaflow.json");
};
const abrir = (file: string, opts?: ConstructorParameters<typeof JsonFileRepository>[1]) => {
  const r = new JsonFileRepository(file, opts);
  abertos.push(r);
  return r;
};

describe("B-05: store inválido nunca vira instalação nova", () => {
  it.each([
    ["0 bytes", ""],
    ["só espaços", "  \n"],
    ["truncado", '{"version":1,"collections":{"usuarios":[{"id":"a","empresaId":"e"'],
    ["sem collections", "{}"],
    ["collections inválido", '{"version":1,"collections":[]}'],
    ["registro corrompido", '{"version":1,"collections":{"usuarios":[{"nome":"sem id"}]}}'],
  ])("%s → StoreInvalidoError com o caminho do backup; o arquivo não é tocado", (_nome, conteudo) => {
    const file = store();
    fs.writeFileSync(file, conteudo);
    fs.writeFileSync(`${file}.bak`, JSON.stringify({ version: 1, collections: {} }));
    let erro: unknown;
    try {
      new JsonFileRepository(file);
    } catch (e) {
      erro = e;
    }
    expect(erro).toBeInstanceOf(StoreInvalidoError);
    expect((erro as Error).message).toMatch(/não vai começar uma instalação nova/);
    expect((erro as Error).message).toContain(`pnpm erp:restaurar-backup ${file}.bak`);
    expect(fs.readFileSync(file, "utf8")).toBe(conteudo);
  });

  it("store sumido com backups ou journal ao lado → recusa (não recria vazio)", () => {
    const file = store();
    fs.writeFileSync(`${file}.bak`, JSON.stringify({ version: 1, collections: {} }));
    expect(() => new JsonFileRepository(file)).toThrow(/não existe, mas há journal ou backups/);
    expect(fs.existsSync(file)).toBe(false);
  });

  it("pasta realmente nova → cria o store vazio (0600), sem tmp sobrando", () => {
    const file = store();
    abrir(file);
    expect(JSON.parse(fs.readFileSync(file, "utf8"))).toMatchObject({ version: 1, collections: {} });
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    expect(fs.readdirSync(path.dirname(file)).filter(f => f.endsWith(".tmp"))).toEqual([]);
  });

  it("integração: o servidor real recusa subir com o store vazio e aponta o backup; nada é recriado", async () => {
    const file = store();
    const dir = path.dirname(file);
    fs.writeFileSync(file, "");
    fs.writeFileSync(`${file}.bak`, JSON.stringify({ version: 1, collections: {} }));
    const srv = await subirServidor(dir, {}, false);
    expect(await esperarSaida(srv)).toBe(1);
    expect(srv.log()).toMatch(/NÃO subiu/);
    expect(srv.log()).toContain("pnpm erp:restaurar-backup");
    expect(srv.log()).not.toMatch(/administrador inicial/i);
    expect(fs.readFileSync(file, "utf8")).toBe("");
    expect(fs.existsSync(caminhoTrava(dir))).toBe(false);
  }, 60_000);
});

describe("B-05: gravação durável, atômica e com backup", () => {
  it("gravação confirmada sobrevive a uma queda antes da consolidação (journal com fsync)", async () => {
    const file = store();
    const repo = abrir(file, { debounceMs: 60_000, maxWaitMs: 60_000 });
    const rec = await repo.insert("estoque", "e1", { codigo: "A" });
    await repo.update("estoque", "e1", rec.id, { codigo: "A2" });
    // "queda": ninguém consolidou o snapshot; outro processo abre o que está no disco
    const depois = abrir(file, { somenteLeitura: true });
    expect((await depois.get<{ codigo: string }>("estoque", "e1", rec.id))?.data.codigo).toBe("A2");
    expect(JSON.parse(fs.readFileSync(file, "utf8")).collections.estoque).toBeUndefined(); // ainda só no journal
  });

  it("linha final cortada no journal (queda no meio da gravação) é ignorada; linha do meio corrompida recusa", async () => {
    const file = store();
    const repo = abrir(file, { debounceMs: 60_000, maxWaitMs: 60_000 });
    await repo.insert("estoque", "e1", { codigo: "OK" });
    const journal = fs.readdirSync(path.dirname(file)).find(f => f.includes(".journal."))!;
    const jp = path.join(path.dirname(file), journal);
    fs.appendFileSync(jp, '{"op":"put","c":"estoque","row":{"id":"x"');
    const lido = abrir(file, { somenteLeitura: true });
    expect((await lido.list("estoque", "e1")).total).toBe(1);
    fs.appendFileSync(jp, '\n{"op":"put","c":"estoque","row":{"id":"y","empresaId":"e1","data":{}}}\n');
    expect(() => new JsonFileRepository(file, { somenteLeitura: true })).toThrow(/journal .* corrompido na linha 2/);
  });

  it("cada consolidação guarda o snapshot anterior (.bak) e uma cópia rotativa em backups/, com limite", async () => {
    const file = store();
    const repo = abrir(file, { backupIntervalMs: 0, backupKeep: 3 });
    for (let i = 0; i < 6; i++) {
      await repo.insert("estoque", "e1", { codigo: `C${i}` });
      await repo.flush();
      await new Promise(r => setTimeout(r, 1100)); // carimbo por segundo
    }
    expect(fs.existsSync(`${file}.bak`)).toBe(true);
    const bak = JSON.parse(fs.readFileSync(`${file}.bak`, "utf8"));
    expect(bak.collections.estoque).toHaveLength(5); // o anterior ao último
    const auto = fs.readdirSync(path.join(path.dirname(file), "backups")).filter(f => f.includes("-auto-"));
    expect(auto).toHaveLength(3);
    expect(listarBackups(file)[0]).toBe(`${file}.bak`);
    expect(JSON.parse(fs.readFileSync(file, "utf8")).collections.estoque).toHaveLength(6);
    expect(fs.readdirSync(path.dirname(file)).filter(f => f.includes(".journal.") || f.endsWith(".tmp"))).toEqual([]);
  }, 30_000);

  it("adaptação do teste proposto: depois de gravar e consolidar, existe cópia do estado anterior", async () => {
    const file = store();
    const repo = abrir(file);
    await repo.insert("estoque", "e1", { codigo: "A" });
    await repo.insert("estoque", "e1", { codigo: "B" });
    await repo.flush();
    expect(fs.readdirSync(path.dirname(file)).filter(f => /\.bak|backup/i.test(f)).length).toBeGreaterThan(0);
  });
});

describe("B-05: pnpm erp:backup e pnpm erp:restaurar-backup", () => {
  it("backup com o 'servidor' aberto inclui o que só está no journal; sai 0600 e abre", async () => {
    const file = store();
    const servidor = abrir(file, { debounceMs: 60_000, maxWaitMs: 60_000 });
    await servidor.insert("financeiro", "e1", { descricao: "só no journal" });
    const destino = destinoDoBackup([], path.dirname(file), new Date("2026-10-17T12:00:00Z"));
    expect(destino).toBe(path.join(path.dirname(file), "backups", "injetaflow-manual-20261017-120000.json"));
    const out = fazerBackup(destino, file);
    expect(out.registros).toBe(1);
    expect(fs.statSync(destino).mode & 0o777).toBe(0o600);
    expect(fs.readFileSync(destino, "utf8")).toContain("só no journal");
    expect(() => destinoDoBackup(["--xyz"])).toThrow(/desconhecido/);
  });

  it("restaurar guarda o estado atual antes (nada se perde), recusa backup inválido e o store restaurado abre", async () => {
    const file = store();
    const dir = path.dirname(file);
    const repo = new JsonFileRepository(file);
    await repo.insert("estoque", "e1", { codigo: "ANTES" });
    repo.close();
    const backup = path.join(dir, "externo.json");
    fs.writeFileSync(backup, JSON.stringify({ version: 1, collections: { estoque: [{ id: "r1", empresaId: "e1", data: { codigo: "DO-BACKUP" }, createdAt: "", updatedAt: "", createdBy: null, updatedBy: null, deletedAt: null }] } }));

    const vazio = path.join(dir, "vazio.json");
    fs.writeFileSync(vazio, "");
    expect(() => restaurarBackup(vazio, file)).toThrow(StoreInvalidoError);
    expect(fs.readFileSync(file, "utf8")).toContain("ANTES"); // recusou antes de mexer

    const out = restaurarBackup(backup, file, new Date("2026-10-17T13:00:00Z"));
    expect(out.registros).toBe(1);
    const guardado = path.join(dir, "backups", "injetaflow-antes-da-restauracao-20261017-130000.json");
    expect(out.guardados).toEqual([guardado]);
    expect(fs.readFileSync(guardado, "utf8")).toContain("ANTES");
    const lido = abrir(file, { somenteLeitura: true });
    expect((await lido.list<{ codigo: string }>("estoque", "e1")).items.map(i => i.data.codigo)).toEqual(["DO-BACKUP"]);
    expect(parseRestaurarBackupArgs(["--listar"]).listar).toBe(true);
    expect(() => parseRestaurarBackupArgs([])).toThrow(/Informe o arquivo/);
  });

  it("restaurar um store corrompido guarda a cópia bruta dele (e o journal) antes de trocar", () => {
    const file = store();
    const dir = path.dirname(file);
    fs.writeFileSync(file, '{"version":1,"coll');
    fs.writeFileSync(`${file}.journal.3`, '{"op":"del","c":"x","ids":["1"]}\n');
    const backup = path.join(dir, "bom.json");
    fs.writeFileSync(backup, JSON.stringify({ version: 1, collections: {} }));
    const out = restaurarBackup(backup, file, new Date("2026-10-17T14:00:00Z"));
    expect(out.guardados.some(g => g.endsWith(".bruto") && fs.readFileSync(g, "utf8") === '{"version":1,"coll')).toBe(true);
    expect(out.guardados.some(g => g.includes("journal"))).toBe(true);
    expect(fs.readdirSync(dir).filter(f => f.includes(".journal."))).toEqual([]);
  });

  it("integração: as CLIs de verdade (backup → estrago → restaurar) e o servidor sobe de novo", async () => {
    const file = store();
    const dir = path.dirname(file);
    const repo = new JsonFileRepository(file);
    await repo.insert("estoque", "wamovale", { codigo: "PRECIOSO" });
    repo.close();
    const bk = rodarCli("tools/backup.ts", [], dir);
    expect(bk.status, bk.stderr).toBe(0);
    const caminho = /Backup gravado: (\S+)/.exec(bk.stdout)?.[1];
    expect(caminho && fs.existsSync(caminho)).toBe(true);
    fs.writeFileSync(file, ""); // disco cheio
    const lista = rodarCli("tools/restaurar-backup.ts", ["--listar"], dir);
    expect(lista.stdout).toContain(caminho!);
    const rs = rodarCli("tools/restaurar-backup.ts", [caminho!], dir);
    expect(rs.status, rs.stderr).toBe(0);
    expect(rs.stdout).toMatch(/Backup restaurado/);
    const srv = await subirServidor(dir);
    await srv.parar();
    const lido = abrir(file, { somenteLeitura: true });
    expect((await lido.list<{ codigo: string }>("estoque", "wamovale")).items.map(i => i.data.codigo)).toContain("PRECIOSO");
  }, 90_000);
});
