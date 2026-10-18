import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import type { NextFunction, Request, Response } from "express";

/**
 * Arquivos estáticos do build com compressão (brotli/gzip) e cache HTTP, sem dependência nova.
 *
 * - /assets/* tem hash no nome (Vite): cache de 1 ano, immutable.
 * - index.html (e o fallback da SPA): no-cache, para o navegador sempre revalidar e pegar o build novo.
 * - demais arquivos públicos (favicon, imagens soltas): 1 hora.
 * O conteúdo comprimido fica em memória por arquivo/mtime, então cada arquivo é comprimido uma vez.
 */

const COMPRESSIVEIS = new Set([".js", ".mjs", ".css", ".html", ".svg", ".json", ".txt", ".xml", ".map", ".webmanifest", ".ico"]);
const MIN_BYTES = 1024;

export function cacheControlEstatico(relPath: string): string {
  const rel = relPath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (rel.startsWith("assets/")) return "public, max-age=31536000, immutable";
  if (rel === "" || rel.endsWith(".html")) return "no-cache";
  return "public, max-age=3600";
}

export function escolherCodificacao(acceptEncoding: string | undefined): "br" | "gzip" | null {
  if (!acceptEncoding) return null;
  const aceitas = new Map<string, number>();
  for (const part of acceptEncoding.toLowerCase().split(",")) {
    const [name, ...params] = part.trim().split(";");
    const q = params.map(p => p.trim()).find(p => p.startsWith("q="));
    aceitas.set(name.trim(), q ? Number(q.slice(2)) || 0 : 1);
  }
  const ok = (enc: string) => (aceitas.get(enc) ?? aceitas.get("*") ?? 0) > 0;
  if (ok("br")) return "br";
  if (ok("gzip")) return "gzip";
  return null;
}

type Comprimido = { key: string; body: Buffer };
const cache = new Map<string, Comprimido>();

function comprimir(file: string, stat: fs.Stats, enc: "br" | "gzip"): Buffer {
  const key = `${stat.size}-${stat.mtimeMs}`;
  const id = `${enc}:${file}`;
  const hit = cache.get(id);
  if (hit && hit.key === key) return hit.body;
  const raw = fs.readFileSync(file);
  const body =
    enc === "br"
      ? zlib.brotliCompressSync(raw, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 9, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: raw.length } })
      : zlib.gzipSync(raw, { level: 9 });
  cache.set(id, { key, body });
  return body;
}

/** Envia um arquivo do build com cache e, se couber, comprimido. Devolve false se não é arquivo. */
export function enviarEstatico(req: Request, res: Response, distPath: string, relPath: string, status = 200): boolean {
  const file = path.resolve(distPath, `.${path.posix.sep}${relPath}`);
  if (file !== distPath && !file.startsWith(distPath + path.sep)) return false;
  let stat: fs.Stats;
  try {
    stat = fs.statSync(file);
  } catch {
    return false;
  }
  if (!stat.isFile()) return false;
  const ext = path.extname(file).toLowerCase();
  const enc = COMPRESSIVEIS.has(ext) && stat.size >= MIN_BYTES ? escolherCodificacao(req.get("accept-encoding")) : null;
  const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}${enc ? `-${enc}` : ""}"`;
  res.status(status);
  res.type(ext || "application/octet-stream");
  res.setHeader("Cache-Control", cacheControlEstatico(path.relative(distPath, file)));
  res.setHeader("Vary", "Accept-Encoding");
  res.setHeader("Last-Modified", stat.mtime.toUTCString());
  res.setHeader("ETag", etag);
  if (status === 200 && req.get("if-none-match") === etag) {
    res.status(304).end();
    return true;
  }
  const body = enc ? comprimir(file, stat, enc) : fs.readFileSync(file);
  if (enc) res.setHeader("Content-Encoding", enc);
  res.setHeader("Content-Length", String(body.length));
  if (req.method === "HEAD") res.end();
  else res.end(body);
  return true;
}

/** Middleware dos estáticos: GET/HEAD de arquivos existentes no build; o resto segue adiante. */
export function estaticosComCompressao(distPath: string) {
  const root = path.resolve(distPath);
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    let rel: string;
    try {
      rel = decodeURIComponent(req.path);
    } catch {
      return next();
    }
    if (rel.includes("\0") || rel.split("/").some(seg => seg.startsWith("."))) return next(); // sem dotfiles nem ".."
    if (rel.endsWith("/")) rel += "index.html";
    if (!enviarEstatico(req, res, root, rel)) return next();
  };
}
