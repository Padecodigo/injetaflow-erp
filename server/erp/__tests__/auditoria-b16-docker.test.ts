import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * B-16 (média): .dockerignore não excluía .data/ (o `docker build` copiava store, hashes, sessões,
 * anexos para a imagem); o Dockerfile rodava como root e sem volume de dados.
 */
const root = path.resolve(__dirname, "../../..");
const linhas = (f: string) => fs.readFileSync(path.join(root, f), "utf8").split(/\r?\n/).map(l => l.trim());

describe("B-16: imagem Docker sem dados locais e sem root", () => {
  it(".dockerignore exclui .data, .data-*, journal, backups e a senha inicial", () => {
    const ig = linhas(".dockerignore");
    for (const padrao of [".data", ".data-*", "*.journal.*", "backups", "senha-inicial.txt", "test-results", "playwright-report"]) expect(ig, padrao).toContain(padrao);
  });

  it("Dockerfile: usuário não root, volume de dados com dono certo e pasta de dados apontada", () => {
    const df = fs.readFileSync(path.join(root, "Dockerfile"), "utf8");
    expect(df).toMatch(/^USER\s+node\s*$/m);
    expect(df).not.toMatch(/^USER\s+root/m);
    expect(df).toMatch(/^VOLUME\s+\["\/app\/\.data"\]/m);
    expect(df).toMatch(/^ENV INJETAFLOW_DATA_DIR=\/app\/\.data$/m);
    expect(df).toMatch(/chown node:node \/app\/\.data/);
    // USER vem depois de todos os RUN (o build continua com root; o processo final não)
    const ultimoRun = df.lastIndexOf("\nRUN ");
    expect(df.indexOf("\nUSER node")).toBeGreaterThan(ultimoRun);
  });
});
