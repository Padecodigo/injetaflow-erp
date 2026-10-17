import { useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import {
  Bell, Boxes, CalendarClock, ChevronDown, ChevronRight, CircleHelp, ClipboardList, Factory, Inbox, LayoutDashboard, LockKeyhole, LogOut,
  Menu, Search, Settings2, ShieldCheck, Sparkles, UserRound, Users, WalletCards, Wrench, X,
} from "lucide-react";
import { toast } from "sonner";
import { ERP_ROUTES, type ErpRoute } from "@shared/erp/routes";
import { trpc } from "@/lib/trpc";
import { useSession } from "./session";
import { initials, shortToday } from "./format";
import { Modal, Spinner } from "./components/ui";

const ICONS: Record<string, typeof LayoutDashboard> = {
  "/dashboard": LayoutDashboard, "/producao": Factory, "/ordens": ClipboardList, "/qualidade": ShieldCheck, "/estoque": Boxes,
  "/moldes": Wrench, "/materia-prima": Boxes, "/pigmentos": Sparkles, "/manutencao": Wrench, "/rh": Users, "/financeiro": WalletCards,
  "/solicitacoes": Inbox, "/usuarios": UserRound, "/configuracoes": Settings2, "/meu-perfil": UserRound,
};

function GlobalSearchResults({ q, onClose }: { q: string; onClose: () => void }) {
  const [, navigate] = useLocation();
  const results = trpc.records.searchAll.useQuery({ q });
  return (
    <Modal wide title={`Resultados para “${q}”`} eyebrow="Busca global" onClose={onClose}>
      {results.isLoading ? <Spinner /> : results.error ? <p>Erro na busca.</p> : results.data!.length === 0 ? (
        <p className="erp-confirm-text">Nada encontrado nos módulos que você pode acessar.</p>
      ) : (
        <ul className="erp-search-results">
          {results.data!.map(item => (
            <li key={`${item.module}-${item.id}`}>
              <button type="button" onClick={() => { onClose(); navigate(`${item.route}?q=${encodeURIComponent(item.titulo)}`); }}>
                <span className="erp-search-results__module">{item.moduleLabel}</span>
                <b>{item.titulo}</b>
                <small>{item.subtitulo}</small>
                <ChevronRight size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

function Notifications() {
  const { can } = useSession();
  const enabled = can("dashboard");
  const summary = trpc.dashboard.summary.useQuery({ periodo: "hoje" }, { enabled });
  const alerts = summary.data?.alertas ?? [];
  return (
    <Dropdown.Root modal={false}>
      <Dropdown.Trigger asChild>
        <button type="button" className="topbar-icon" aria-label={`Notificações${alerts.length ? ` (${alerts.length})` : ""}`}>
          {alerts.length > 0 && <span className="notification-dot" />}<Bell size={17} />
        </button>
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content className="erp-menu erp-menu--wide" align="end" sideOffset={6}>
          <Dropdown.Label className="erp-menu__label">Alertas operacionais</Dropdown.Label>
          {!enabled && <div className="erp-menu__empty">Seu perfil não acompanha os alertas do dashboard.</div>}
          {enabled && alerts.length === 0 && <div className="erp-menu__empty">Você está em dia. Nenhum alerta agora.</div>}
          {alerts.map(alert => (
            <Dropdown.Item key={alert.titulo} className="erp-menu__item erp-menu__item--stack" asChild>
              <Link href={alert.href}><b>{alert.titulo}</b><small>{alert.detalhe}</small></Link>
            </Dropdown.Item>
          ))}
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}

function UserMenu({ trigger }: { trigger: ReactNode }) {
  const { user, logout } = useSession();
  const [, navigate] = useLocation();
  const doLogout = async () => {
    await logout();
    toast.dismiss();
    toast.success("Sessão encerrada", { description: "Até logo!" });
    navigate("/erp");
  };
  return (
    <Dropdown.Root modal={false}>
      <Dropdown.Trigger asChild>{trigger}</Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content className="erp-menu" align="end" sideOffset={6}>
          <Dropdown.Label className="erp-menu__label">{user?.nome}<small>{user?.email} · {user?.perfil}</small></Dropdown.Label>
          <Dropdown.Item className="erp-menu__item" onSelect={() => navigate("/meu-perfil")}><UserRound size={14} /> Meu perfil</Dropdown.Item>
          <Dropdown.Separator className="erp-menu__sep" />
          <Dropdown.Item className="erp-menu__item erp-menu__item--danger" onSelect={doLogout}><LogOut size={14} /> Sair</Dropdown.Item>
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}

export function ErpLayout({ children }: { children: ReactNode }) {
  const [location, navigate] = useLocation();
  const { user, can } = useSession();
  const config = trpc.config.get.useQuery(undefined, { enabled: Boolean(user) });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState<string | null>(null);
  const [help, setHelp] = useState(false);

  const go = (route: ErpRoute) => {
    if (!can(route.permission)) {
      toast.info("Módulo não liberado", { description: `${route.label} não faz parte das permissões do seu perfil. Peça acesso ao administrador.` });
      return;
    }
    navigate(route.path);
    setMobileOpen(false);
  };

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    const term = search.trim();
    if (term.length < 2) {
      toast.info("Digite pelo menos 2 caracteres para buscar.");
      return;
    }
    setSearching(term);
  };

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileOpen ? "sidebar--open" : ""}`} aria-label="Menu do ERP">
        <div className="brand"><img className="tenant-logo" src="/tenant/wamovale-logo.jpg" alt="Wamovale" /><span className="brand-badge">ERP</span><button type="button" className="mobile-close" aria-label="Fechar menu" onClick={() => setMobileOpen(false)}><X size={18} /></button></div>
        <Dropdown.Root modal={false}>
          <Dropdown.Trigger asChild>
            <button type="button" className="workspace-switcher"><span className="workspace-avatar">{initials(config.data?.nomeExibicao ?? "Wamovale")}</span><span><small>Empresa ativa</small><b>{config.data?.nomeExibicao ?? "Wamovale"}</b></span><ChevronDown size={15} /></button>
          </Dropdown.Trigger>
          <Dropdown.Portal>
            <Dropdown.Content className="erp-menu" align="start" sideOffset={4}>
              <Dropdown.Label className="erp-menu__label">Empresas vinculadas<small>Seu usuário pertence a 1 empresa.</small></Dropdown.Label>
              <Dropdown.Item className="erp-menu__item" onSelect={() => toast.success(`${config.data?.nomeExibicao ?? "Wamovale"} já é a empresa ativa`)}><ShieldCheck size={14} /> {config.data?.nomeExibicao ?? "Wamovale"} (ativa)</Dropdown.Item>
            </Dropdown.Content>
          </Dropdown.Portal>
        </Dropdown.Root>
        <nav className="sidebar-nav">
          {ERP_ROUTES.map(route => {
            const Icon = ICONS[route.path] ?? LayoutDashboard;
            const allowed = can(route.permission);
            const active = location === route.path;
            return (
              <div key={route.path}>
                {route.section && <span className="nav-section">{route.section}</span>}
                <a
                  href={route.path}
                  onClick={event => { event.preventDefault(); go(route); }}
                  aria-current={active ? "page" : undefined}
                  aria-disabled={!allowed || undefined}
                  className={`nav-item ${active ? "nav-item--active" : ""} ${allowed ? "" : "nav-item--restricted"}`}
                  title={allowed ? route.label : `${route.label} (sem permissão)`}
                >
                  <Icon size={18} strokeWidth={active ? 2.4 : 1.9} /><span>{route.label}</span>
                  {!allowed && <LockKeyhole size={13} className="nav-lock" aria-label="sem permissão" />}
                </a>
              </div>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <button type="button" className="help-card" onClick={() => setHelp(true)}><span className="help-spark"><CircleHelp size={16} /></span><div><b>Precisa de ajuda?</b><small>Como usar o ERP</small></div><ChevronRight size={15} /></button>
          <UserMenu trigger={<button type="button" className="user-card" aria-label="Menu do usuário"><span className="user-avatar">{initials(user?.nome)}</span><span><b>{user?.nome}</b><small>{user?.perfil} · {user?.matricula}</small></span><ChevronDown size={15} /></button>} />
        </div>
      </aside>
      {mobileOpen && <button type="button" className="sidebar-overlay" aria-label="Fechar menu" onClick={() => setMobileOpen(false)} />}
      <main className="main-content">
        <header className="topbar">
          <button type="button" className="mobile-menu" aria-label="Abrir menu" onClick={() => setMobileOpen(true)}><Menu size={20} /></button>
          <form className="global-search" onSubmit={submitSearch} role="search">
            <Search size={17} />
            <input aria-label="Busca global" value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar ordens, lotes, moldes, pessoas..." />
            <button type="submit" className="erp-search-submit">Buscar</button>
          </form>
          <div className="topbar-actions">
            <span className="access-mode access-mode--logged"><span className="access-mode__dot" />Sessão autenticada · {user?.perfil}</span>
            <div className="topbar-date" aria-label="Data de hoje"><CalendarClock size={16} /><span>{shortToday()}</span></div>
            <Notifications />
            <UserMenu trigger={<button type="button" className="topbar-avatar" aria-label="Conta e sair">{initials(user?.nome)}</button>} />
          </div>
        </header>
        <div className="page-content">{children}</div>
        <footer className="app-footer"><span><span className="footer-pulse" /> Dados gravados no servidor · {config.data?.unidade ?? "Wamovale"}</span><span>InjetaFlow ERP <b>MVP</b></span></footer>
      </main>
      {searching && <GlobalSearchResults q={searching} onClose={() => setSearching(null)} />}
      {help && (
        <Modal title="Ajuda rápida" eyebrow="InjetaFlow ERP" icon={<CircleHelp size={20} />} onClose={() => setHelp(false)}>
          <ul className="erp-help-list">
            <li><b>Criar:</b> use o botão “Novo…” no topo de cada módulo.</li>
            <li><b>Editar ou excluir:</b> clique no “⋯” da linha ou dê duplo clique na linha.</li>
            <li><b>Buscar e filtrar:</b> use a barra acima da tabela; a exportação CSV respeita os filtros.</li>
            <li><b>Sem acesso a um módulo?</b> Itens com cadeado não fazem parte do seu perfil. Fale com o administrador.</li>
            <li><b>Sair:</b> clique no seu nome (menu lateral ou canto superior) e escolha “Sair”.</li>
          </ul>
          <div className="erp-modal-actions"><button type="button" className="button button--primary erp-autofocus" onClick={() => setHelp(false)}>Entendi</button></div>
        </Modal>
      )}
    </div>
  );
}
