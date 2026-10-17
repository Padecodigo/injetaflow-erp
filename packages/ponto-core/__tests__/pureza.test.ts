import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * O ponto-core é domínio puro (plano v2 §4.8): sem I/O, banco, HTTP, relógio do sistema, aleatoriedade ou
 * framework, e sem dependência do protótipo (server/client/shared). Este teste lê os fontes e falha se algo
 * proibido aparecer.
 */
const pasta = join(import.meta.dirname, "..", "src");
const fontes = readdirSync(pasta).filter(f => f.endsWith(".ts")).map(f => ({ arquivo: f, codigo: readFileSync(join(pasta, f), "utf8") }));

describe("ponto-core é puro", () => {
  it("só importa módulos do próprio pacote e node:crypto", () => {
    expect(fontes.length).toBeGreaterThan(5);
    for (const { arquivo, codigo } of fontes) {
      const imports = [...codigo.matchAll(/(?:import|export)[^"']*?from\s+["']([^"']+)["']/g)].map(m => m[1]);
      for (const spec of imports) expect(spec === "node:crypto" || spec.startsWith("./"), `${arquivo}: ${spec}`).toBe(true);
    }
  });

  it("não usa I/O, relógio do sistema, ambiente nem aleatoriedade", () => {
    const proibidos = [/\bprocess\./, /Date\.now\(/, /new Date\(\)/, /Math\.random/, /\bfetch\(/, /\brequire\(/, /\bsetTimeout\(/, /\bconsole\./, /node:fs|node:net|node:http|node:child_process/];
    for (const { arquivo, codigo } of fontes) {
      for (const re of proibidos) expect(re.test(codigo), `${arquivo} usa ${re}`).toBe(false);
    }
  });
});
