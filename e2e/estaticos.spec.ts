import { expect, test } from "@playwright/test";

/** Auditoria de frontend (item de backend): build de produção servido com compressão e cache. */
test("estáticos do build saem comprimidos (br/gzip), com cache imutável nos assets e no-cache no index.html", async ({ request }) => {
  const index = await request.get("/", { headers: { "accept-encoding": "br, gzip" } });
  expect(index.status()).toBe(200);
  expect(index.headers()["cache-control"]).toBe("no-cache");
  // index.html tem < 1 KB: vai sem compressão (não compensa); os bundles vão comprimidos
  const html = await index.text();
  const asset = /\/assets\/[^"']+\.js/.exec(html)?.[0];
  expect(asset, "index.html referencia o bundle JS").toBeTruthy();
  const js = await request.get(asset!, { headers: { "accept-encoding": "gzip" } });
  expect(js.status()).toBe(200);
  expect(js.headers()["content-encoding"]).toBe("gzip");
  expect(js.headers()["cache-control"]).toBe("public, max-age=31536000, immutable");
  expect(js.headers()["vary"]).toMatch(/Accept-Encoding/i);
  const css = /\/assets\/[^"']+\.css/.exec(html)?.[0];
  expect(css, "index.html referencia o CSS").toBeTruthy();
  const estilo = await request.get(css!, { headers: { "accept-encoding": "br, gzip" } });
  expect(estilo.headers()["content-encoding"]).toBe("br");
  expect(estilo.headers()["cache-control"]).toContain("immutable");
  // os cabeçalhos de segurança continuam nos estáticos
  expect(js.headers()["x-content-type-options"]).toBe("nosniff");
});
