import { useEffect, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { LockKeyhole } from "lucide-react";
import type { PermissionKey } from "@shared/erp/modules";
import { ERP_ROUTES } from "@shared/erp/routes";
import { useSession } from "./session";
import { ErpLayout } from "./ErpLayout";
import { Spinner } from "./components/ui";

export function firstAllowedRoute(can: (key: PermissionKey | null) => boolean): string {
  return ERP_ROUTES.find(route => route.permission !== null && can(route.permission))?.path ?? "/meu-perfil";
}

/** Guarda de rota privada: sem sessão → login (voltando para a rota pedida); sem permissão → 403. */
export function RequireAuth({ permission, children }: { permission: PermissionKey | null; children: ReactNode }) {
  const { user, loading, can } = useSession();
  const [location, navigate] = useLocation();
  useEffect(() => {
    if (!loading && !user) navigate(`/erp?next=${encodeURIComponent(location + window.location.search)}`, { replace: true });
  }, [loading, user, location, navigate]);

  if (loading || !user) return <div className="erp-fullscreen"><Spinner label="Verificando sessão..." /></div>;
  if (!can(permission)) {
    return (
      <ErpLayout>
        <section className="restricted-panel" data-testid="forbidden">
          <div className="restricted-panel__icon"><LockKeyhole size={25} /></div>
          <span className="eyebrow">Acesso negado (403)</span>
          <h2>Este módulo não está liberado para você</h2>
          <p>Seu perfil <b>{user.perfil}</b> não tem permissão para acessar esta área. Se precisar, peça ao administrador para ajustar seus módulos em Usuários e acessos.</p>
          <Link className="button button--primary" href={firstAllowedRoute(can)}>Ir para minha área</Link>
        </section>
      </ErpLayout>
    );
  }
  return <ErpLayout>{children}</ErpLayout>;
}
