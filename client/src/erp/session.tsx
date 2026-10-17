import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { hasPermission, type AccessLevel, type PermissionKey } from "@shared/erp/modules";
import { trpc } from "@/lib/trpc";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";

export type SessionUser = NonNullable<inferRouterOutputs<AppRouter>["auth"]["me"]>;

type SessionContextValue = {
  user: SessionUser | null;
  loading: boolean;
  can: (key: PermissionKey | null, level?: AccessLevel) => boolean;
  logout: () => Promise<void>;
  refresh: () => Promise<unknown>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

/** Sessão do ERP lida do servidor (cookie httpOnly). Sobrevive a F5 e URL direta (B02). */
export function SessionProvider({ children }: { children: ReactNode }) {
  const utils = trpc.useUtils();
  const me = trpc.auth.me.useQuery(undefined, { retry: false, refetchOnWindowFocus: true, staleTime: 30_000 });
  const logoutMutation = trpc.auth.logout.useMutation();

  const logout = useCallback(async () => {
    try {
      await logoutMutation.mutateAsync();
    } finally {
      utils.auth.me.setData(undefined, null);
      utils.invalidate();
    }
  }, [logoutMutation, utils]);

  const value = useMemo<SessionContextValue>(() => {
    const user = me.data ?? null;
    return {
      user,
      loading: me.isLoading,
      can: (key, level = "ver") => (key === null ? Boolean(user) : hasPermission(user, key, level)),
      logout,
      refresh: () => me.refetch(),
    };
  }, [me.data, me.isLoading, logout, me]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession fora do SessionProvider");
  return ctx;
}
