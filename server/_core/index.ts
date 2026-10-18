import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { publicPlatformScript } from "./publicConfig";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { registerErpHttpRoutes } from "../erp/http";
import { ARQUIVO_SENHA_INICIAL, ensureSeed } from "../erp/seed";
import path from "node:path";
import { dataDir, getRepository } from "../erp/store";
import { StoreInvalidoError } from "../erp/repository";
import { adquirirTrava, PastaDeDadosEmUsoError } from "../erp/trava";
import { configureTrustProxy, trailingSlashRedirect } from "../erp/net";

async function startServer() {
  const app = express();
  const server = createServer(app);
  app.disable("x-powered-by");
  configureTrustProxy(app);
  app.use(trailingSlashRedirect);
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    next();
  });
  // anexos públicos (currículo/desenho) vão em base64 com no máximo 5 MB
  app.use(express.json({ limit: "8mb" }));
  app.use(express.urlencoded({ limit: "1mb", extended: true }));
  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  app.get("/api/platform/config.js", (_req, res) => {
    res.set("Cache-Control", "no-store").type("application/javascript").send(publicPlatformScript());
  });
  registerOAuthRoutes(app);
  registerErpHttpRoutes(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = Number(process.env.PORT || "3000");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid PORT");

  // B-04: trava da pasta de dados (as CLIs que gravam recusam enquanto o servidor estiver no ar)
  try {
    adquirirTrava(dataDir(), { papel: "servidor", porta: port });
  } catch (error) {
    if (!(error instanceof PastaDeDadosEmUsoError)) throw error;
    console.error(`[InjetaFlow] O servidor NÃO subiu: ${error.message} Dois processos gravando a mesma pasta perderiam dados.`);
    process.exit(1);
  }
  // B-05: store vazio, truncado ou inválido não vira instalação nova; o servidor recusa e aponta o backup
  let repo;
  try {
    repo = getRepository();
  } catch (error) {
    if (!(error instanceof StoreInvalidoError)) throw error;
    console.error(`\n[InjetaFlow] O servidor NÃO subiu.\n${error.message}\n`);
    process.exit(1);
  }
  // Ctrl+C / docker stop: consolida o store e solta a trava (eventos "exit")
  for (const sinal of ["SIGINT", "SIGTERM"] as const) process.once(sinal, () => process.exit(0));
  // B-11: senha gerada no 1º start vai para um arquivo 0600 na pasta de dados, nunca para o stdout
  await ensureSeed(repo, { arquivoSenha: path.join(dataDir(), ARQUIVO_SENHA_INICIAL) });
  server.on("error", error => { console.error("Server failed:", error.message); process.exit(1); });
  server.listen(port, "0.0.0.0", () => console.log(`Server listening on port ${port}`));
}

startServer().catch(error => { console.error(error); process.exit(1); });
