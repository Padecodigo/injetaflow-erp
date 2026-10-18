import express from "express";
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cacheControlEstatico, enviarEstatico, escolherCodificacao, estaticosComCompressao } from "../../_core/static";

/** Auditoria de frontend (item de backend): Express servia os estáticos sem compressão e sem política de cache. */
describe("estáticos do build: compressão (br/gzip) e cache", () => {
  it("unitário: política de cache por tipo de arquivo", () => {
    expect(cacheControlEstatico("assets/index-AbC123.js")).toBe("public, max-age=31536000, immutable");
    expect(cacheControlEstatico("index.html")).toBe("no-cache");
    expect(cacheControlEstatico("favicon.ico")).toBe("public, max-age=3600");
  });

  it("unitário: negocia br, depois gzip, respeitando q=0", () => {
    expect(escolherCodificacao("gzip, deflate, br")).toBe("br");
    expect(escolherCodificacao("gzip, br;q=0")).toBe("gzip");
    expect(escolherCodificacao("identity")).toBeNull();
    expect(escolherCodificacao(undefined)).toBeNull();
    expect(escolherCodificacao("*")).toBe("br");
  });

  const dist = fs.mkdtempSync(path.join(os.tmpdir(), "injetaflow-dist-"));
  const js = `console.log(${JSON.stringify("x".repeat(5000))});\n`;
  const html = `<!doctype html><html><head><title>InjetaFlow</title></head><body>${"<div></div>".repeat(200)}</body></html>`;
  let base = "";
  let server: ReturnType<ReturnType<typeof express>["listen"]>;

  beforeAll(async () => {
    fs.mkdirSync(path.join(dist, "assets"));
    fs.writeFileSync(path.join(dist, "assets", "index-AbC123.js"), js);
    fs.writeFileSync(path.join(dist, "index.html"), html);
    fs.writeFileSync(path.join(dist, "pequeno.txt"), "oi");
    fs.writeFileSync(path.join(dist, ".env"), "SEGREDO=1");
    const app = express();
    app.use(estaticosComCompressao(dist));
    app.use("*", (req, res) => {
      if (!enviarEstatico(req, res, dist, "index.html", 404)) res.status(503).end();
    });
    server = app.listen(0);
    await new Promise(resolve => server.once("listening", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => {
    server?.close();
    fs.rmSync(dist, { recursive: true, force: true });
  });

  type Resposta = { status: number; headers: { get(nome: string): string | null }; corpo: Buffer; text(): Promise<string> };
  /** node:http e não fetch: o fetch descomprime sozinho e esconderia o Content-Encoding real. */
  const get = (rota: string, headers: Record<string, string> = {}, method = "GET") =>
    new Promise<Resposta>((resolve, reject) => {
      const req = http.request(base + rota, { method, headers }, res => {
        const partes: Buffer[] = [];
        res.on("data", (c: Buffer) => partes.push(c));
        res.on("end", () => {
          const corpo = Buffer.concat(partes);
          resolve({
            status: res.statusCode ?? 0,
            headers: { get: nome => { const v = res.headers[nome.toLowerCase()]; return v === undefined ? null : String(v); } },
            corpo,
            text: async () => corpo.toString(),
          });
        });
      });
      req.on("error", reject);
      req.end();
    });
  const bruto = async (res: Resposta) => res.corpo;

  it("integração: JS com hash vai em brotli, com cache imutável e Vary", async () => {
    const res = await get("/assets/index-AbC123.js", { "accept-encoding": "gzip, br" });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-encoding")).toBe("br");
    expect(res.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(res.headers.get("vary")).toMatch(/Accept-Encoding/i);
    expect(res.headers.get("content-type")).toMatch(/javascript/);
    const corpo = await bruto(res);
    expect(corpo.length).toBeLessThan(js.length / 5);
    expect(zlib.brotliDecompressSync(corpo).toString()).toBe(js);
  });

  it("integração: gzip quando o navegador não aceita br; sem compressão quando não aceita nada", async () => {
    const gz = await get("/assets/index-AbC123.js", { "accept-encoding": "gzip" });
    expect(gz.headers.get("content-encoding")).toBe("gzip");
    expect(zlib.gunzipSync(await bruto(gz)).toString()).toBe(js);
    const plain = await get("/assets/index-AbC123.js", { "accept-encoding": "identity" });
    expect(plain.headers.get("content-encoding")).toBeNull();
    expect((await bruto(plain)).toString()).toBe(js);
  });

  it("integração: index.html e o fallback da SPA são no-cache (pegam o build novo) e comprimidos", async () => {
    for (const rota of ["/", "/rota-inexistente"]) {
      const res = await get(rota, { "accept-encoding": "br" });
      expect(res.headers.get("cache-control"), rota).toBe("no-cache");
      expect(res.headers.get("content-encoding"), rota).toBe("br");
      expect(zlib.brotliDecompressSync(await bruto(res)).toString()).toBe(html);
    }
    expect((await get("/rota-inexistente")).status).toBe(404);
  });

  it("integração: ETag gera 304; HEAD não manda corpo; arquivo pequeno vai sem compressão", async () => {
    const first = await get("/assets/index-AbC123.js", { "accept-encoding": "br" });
    const etag = first.headers.get("etag")!;
    expect(etag).toBeTruthy();
    const again = await get("/assets/index-AbC123.js", { "accept-encoding": "br", "if-none-match": etag });
    expect(again.status).toBe(304);
    const head = await get("/assets/index-AbC123.js", { "accept-encoding": "br" }, "HEAD");
    expect(head.status).toBe(200);
    expect(head.corpo.length).toBe(0);
    const small = await get("/pequeno.txt", { "accept-encoding": "br" });
    expect(small.headers.get("content-encoding")).toBeNull();
  });

  it("não serve dotfiles nem sai da pasta do build", async () => {
    const dot = await get("/.env");
    expect((await dot.text())).not.toContain("SEGREDO");
    const fora = await get("/%2e%2e/%2e%2e/etc/passwd");
    expect((await fora.text())).not.toContain("root:");
  });
});
