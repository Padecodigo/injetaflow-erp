import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from "@shared/const";
import { hasPermission, isAdminPerfil, type AccessLevel, type PermissionKey } from "@shared/erp/modules";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";
import type { TrpcContext } from "./context";

/**
 * N15: erros de validação (Zod) saem como texto legível em português, não como o array JSON cru.
 * Os detalhes por campo continuam disponíveis em `data.fieldErrors` para integrações.
 */
export function friendlyZodMessage(error: ZodError): string {
  const messages = error.issues.map(issue => {
    const path = issue.path.filter(p => typeof p === "string" || typeof p === "number").join(".");
    const generic = /^(Invalid|Expected|Required)/i.test(issue.message);
    if (!generic) return issue.message;
    return path ? `Campo "${path}" inválido ou ausente.` : "Dados inválidos.";
  });
  return Array.from(new Set(messages)).join("; ") || "Dados inválidos.";
}

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    const cause = error.cause;
    if (error.code === "BAD_REQUEST" && cause instanceof ZodError) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of cause.issues) {
        const key = issue.path.map(String).join(".") || "_";
        fieldErrors[key] ??= issue.message;
      }
      return { ...shape, message: friendlyZodMessage(cause), data: { ...shape.data, fieldErrors } };
    }
    return shape;
  },
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
