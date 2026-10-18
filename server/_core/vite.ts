import { type Express } from "express";
import fs from "fs";
import { type Server } from "http";
import { enviarEstatico, estaticosComCompressao } from "./static";
import { nanoid } from "nanoid";
import path from "path";
import { createServer as createViteServer } from "vite";
import viteConfig from "../../vite.config";
import { isKnownSpaRoute } from "@shared/erp/routes";

/** Rotas da SPA respondem 200; qualquer outra recebe 404 real (a SPA mostra a página 404). */
export function spaStatus(url: string): number {
  const pathname = url.split("?")[0].split("#")[0];
  if (pathname.startsWith("/api/")) return 404;
  return isKnownSpaRoute(pathname) ? 200 : 404;
}

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(spaStatus(url)).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath =
    process.env.NODE_ENV === "development"
      ? path.resolve(import.meta.dirname, "../..", "dist", "public")
      : path.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }

  // compressão (br/gzip) e cache HTTP dos arquivos do build
  app.use(estaticosComCompressao(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("*", (req, res) => {
    if (req.originalUrl.startsWith("/api/")) return res.status(404).json({ error: "Rota de API inexistente." });
    // sem o build do front, responde aqui mesmo (o handler padrão do Express trocaria os cabeçalhos de segurança)
    if (!enviarEstatico(req, res, path.resolve(distPath), "index.html", spaStatus(req.originalUrl))) {
      res.status(503).type("text/plain").send("Front-end não encontrado: rode pnpm build.");
    }
  });
}
