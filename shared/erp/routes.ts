import type { PermissionKey } from "./modules";

/** Rotas públicas do portal institucional da Wamovale. */
export const PUBLIC_ROUTES = [
  "/",
  "/cotacao",
  "/trabalhe-conosco",
  "/quem-somos",
  "/produtos",
  "/injecao-plastica",
  "/moldes-e-ferramentaria",
  "/materiais-e-pigmentos",
  "/qualidade-institucional",
  "/contato",
] as const;

/** Tela de login do ERP. */
export const LOGIN_ROUTE = "/erp";

export type ErpRoute = {
  path: string;
  label: string;
  section?: string;
  /** null = qualquer usuário autenticado (ex.: Meu perfil). */
  permission: PermissionKey | null;
};

/** Rotas privadas do ERP, na ordem do menu lateral. */
export const ERP_ROUTES: ErpRoute[] = [
  { path: "/dashboard", label: "Dashboard", section: "Visão geral", permission: "dashboard" },
  { path: "/producao", label: "Produção", section: "Operação", permission: "producao" },
  { path: "/ordens", label: "Ordens", permission: "ordens" },
  { path: "/qualidade", label: "Qualidade", permission: "qualidade" },
  { path: "/estoque", label: "Estoque", permission: "estoque" },
  { path: "/moldes", label: "Moldes & ferramentaria", section: "Engenharia", permission: "moldes" },
  { path: "/materia-prima", label: "Matéria-prima", permission: "materia_prima" },
  { path: "/pigmentos", label: "Pigmentos & cores", permission: "pigmentos" },
  { path: "/manutencao", label: "Manutenção", permission: "manutencao" },
  { path: "/rh", label: "RH & ponto", section: "Pessoas", permission: "rh" },
  { path: "/financeiro", label: "Financeiro", section: "Gestão", permission: "financeiro" },
  { path: "/solicitacoes", label: "Solicitações do site", permission: "solicitacoes" },
  { path: "/usuarios", label: "Usuários e acessos", section: "Sistema", permission: "usuarios" },
  { path: "/configuracoes", label: "Configurações", permission: "configuracoes" },
  { path: "/meu-perfil", label: "Meu perfil", section: "Minha conta", permission: null },
];

export function findErpRoute(path: string): ErpRoute | undefined {
  return ERP_ROUTES.find(route => route.path === path);
}

/** Rota conhecida pela SPA. Qualquer outra recebe HTTP 404 do servidor. */
export function isKnownSpaRoute(pathname: string): boolean {
  const clean = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return (
    (PUBLIC_ROUTES as readonly string[]).includes(clean) ||
    clean === LOGIN_ROUTE ||
    ERP_ROUTES.some(route => route.path === clean)
  );
}
