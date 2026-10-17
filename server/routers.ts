import { systemRouter } from "./_core/systemRouter";
import { router } from "./_core/trpc";
import {
  authRouter, configRouter, dashboardRouter, perfilRouter, publicoRouter, recordsRouter, rhRouter, usuariosRouter,
} from "./erp/router";

// Todas as rotas da API ficam em /api/trpc (ver server/_core/index.ts).
export const appRouter = router({
  system: systemRouter,
  auth: authRouter,
  records: recordsRouter,
  usuarios: usuariosRouter,
  rh: rhRouter,
  dashboard: dashboardRouter,
  perfil: perfilRouter,
  config: configRouter,
  publico: publicoRouter,
});

export type AppRouter = typeof appRouter;
