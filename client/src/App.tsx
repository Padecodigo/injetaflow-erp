import type { ComponentType } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import { PUBLIC_ROUTES, ERP_ROUTES, LOGIN_ROUTE } from "@shared/erp/routes";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import { SessionProvider } from "./erp/session";
import { RequireAuth } from "./erp/guard";
import LoginPage from "./erp/pages/LoginPage";
import DashboardPage from "./erp/pages/DashboardPage";
import RhPage from "./erp/pages/RhPage";
import UsuariosPage from "./erp/pages/UsuariosPage";
import ConfiguracoesPage from "./erp/pages/ConfiguracoesPage";
import MeuPerfilPage from "./erp/pages/MeuPerfilPage";
import {
  EstoquePage, FinanceiroPage, ManutencaoPage, MateriaPrimaPage, MoldesPage, OrdensPage, PigmentosPage, ProducaoPage, QualidadePage, SolicitacoesPage,
} from "./erp/pages/ModulePages";

/** Página de cada rota privada. Toda rota em ERP_ROUTES passa por RequireAuth (B01/B04/B10). */
export const ERP_PAGES: Record<string, ComponentType> = {
  "/dashboard": DashboardPage,
  "/producao": ProducaoPage,
  "/ordens": OrdensPage,
  "/qualidade": QualidadePage,
  "/estoque": EstoquePage,
  "/moldes": MoldesPage,
  "/materia-prima": MateriaPrimaPage,
  "/pigmentos": PigmentosPage,
  "/manutencao": ManutencaoPage,
  "/rh": RhPage,
  "/financeiro": FinanceiroPage,
  "/solicitacoes": SolicitacoesPage,
  "/usuarios": UsuariosPage,
  "/configuracoes": ConfiguracoesPage,
  "/meu-perfil": MeuPerfilPage,
};

function Router() {
  return (
    <Switch>
      {PUBLIC_ROUTES.map(path => <Route key={path} path={path} component={Home} />)}
      <Route path={LOGIN_ROUTE} component={LoginPage} />
      {ERP_ROUTES.map(route => {
        const Page = ERP_PAGES[route.path];
        return (
          <Route key={route.path} path={route.path}>
            <RequireAuth permission={route.permission}><Page /></RequireAuth>
          </Route>
        );
      })}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <SessionProvider>
            <Toaster richColors position="top-right" />
            <Router />
          </SessionProvider>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
