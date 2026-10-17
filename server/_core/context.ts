import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { DataRepository } from "../erp/repository";
import type { SessionUser } from "../erp/types";
import { getUserFromToken, readSessionToken } from "../erp/auth";
import { getRepository } from "../erp/store";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  /** Usuário da sessão (cookie httpOnly validado no servidor). */
  user: SessionUser | null;
  repo: DataRepository;
  sessionToken?: string | null;
};

export async function createContext(opts: CreateExpressContextOptions): Promise<TrpcContext> {
  const repo = getRepository();
  const sessionToken = readSessionToken(opts.req);
  let user: SessionUser | null = null;
  try {
    user = await getUserFromToken(repo, sessionToken);
  } catch {
    user = null;
  }
  return { req: opts.req, res: opts.res, user, repo, sessionToken };
}
