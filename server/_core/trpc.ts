import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from "@shared/const";
import { hasPermission, isAdminPerfil, type AccessLevel, type PermissionKey } from "@shared/erp/modules";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

/** Exige sessão válida. */
export const protectedProcedure = t.procedure.use(requireUser);

/** Exige sessão + permissão no módulo (ver ou editar). */
export function moduleProcedure(permission: PermissionKey, level: AccessLevel = "ver") {
  return protectedProcedure.use(async ({ ctx, next }) => {
    if (!hasPermission(ctx.user, permission, level)) {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next();
  });
}

export function assertPermission(user: TrpcContext["user"], permission: PermissionKey, level: AccessLevel = "ver") {
  if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  if (!hasPermission(user, permission, level)) throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
}

export const adminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (!isAdminPerfil(ctx.user.perfil)) {
    throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
  }
  return next();
});
