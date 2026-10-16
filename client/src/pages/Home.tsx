import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Boxes,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  ClipboardList,
  Download,
  Factory,
  Gauge,
  LayoutDashboard,
  LockKeyhole,
  LogIn,
  Menu,
  MoreHorizontal,
  PackageCheck,
  Plus,
  Search,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TimerReset,
  TrendingUp,
  UserRound,
  UserPlus,
  Users,
  MapPin,
  WalletCards,
  Wrench,
  X,
} from "lucide-react";
import { toast } from "sonner";

type IconType = typeof LayoutDashboard;
type Tone = "teal" | "orange" | "red" | "blue" | "lime";

type NavItem = {
  label: string;
  href: string;
  icon: IconType;
  section?: string;
  restricted?: boolean;
};

const navItems: NavItem[] = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard, section: "Visão geral" },
  { label: "Produção", href: "/producao", icon: Factory, section: "Operação" },
  { label: "Qualidade", href: "/qualidade", icon: ShieldCheck },
  { label: "Estoque", href: "/estoque", icon: Boxes },
  { label: "Manutenção", href: "/manutencao", icon: Wrench },
  { label: "RH & ponto", href: "/rh", icon: Users, section: "Pessoas", restricted: true },
  { label: "Ordens", href: "/ordens", icon: ClipboardList, section: "Gestão" },
  { label: "Financeiro", href: "/financeiro", icon: WalletCards, restricted: true },
  { label: "Usuários e acessos", href: "/usuarios", icon: UserRound, section: "Sistema", restricted: true },
  { label: "Configurações", href: "/configuracoes", icon: Settings2, section: "Sistema", restricted: true },
];

const pageCopy: Record<string, { eyebrow: string; title: string; description: string }> = {
  "/producao": {
    eyebrow: "Centro de comando",
    title: "Produção",
    description: "Acompanhe o ritmo da fábrica e ajuste a programação sem perder o próximo ciclo.",
  },
  "/qualidade": {
    eyebrow: "Conformidade em dia",
    title: "Qualidade",
    description: "Do lote da resina ao frasco final: inspeções e barreiras visíveis em um só lugar.",
  },
  "/estoque": {
    eyebrow: "Materiais em movimento",
    title: "Estoque",
    description: "Resinas, pigmentos e embalagens com lote, validade e localização na palma da mão.",
  },
  "/manutencao": {
    eyebrow: "Ativos críticos",
    title: "Manutenção",
    description: "Antecipe desgaste de moldes e periféricos antes que a fábrica sinta o impacto.",
  },
  "/rh": {
    eyebrow: "Pessoas em movimento",
    title: "RH & ponto",
    description: "Acompanhe presença, jornadas, atrasos e registros de ponto com rastreabilidade por colaborador.",
  },
  "/ordens": {
    eyebrow: "Planejamento conectado",
    title: "Ordens de produção",
    description: "Uma fila única para priorizar, liberar e acompanhar cada ordem de injeção.",
  },
  "/financeiro": {
    eyebrow: "Margem no radar",
    title: "Financeiro",
    description: "Custos reais, faturamento e fluxo de caixa alinhados ao que acontece no chão de fábrica.",
  },
  "/configuracoes": {
    eyebrow: "Seu jeito de operar",
    title: "Configurações",
    description: "Conecte dados mestres, regras e integrações sem deixar a operação esperando.",
  },
  "/usuarios": {
    eyebrow: "Governança de acesso",
    title: "Usuários e acessos",
    description: "Cadastre pessoas e escolha exatamente quais módulos, ações e níveis de acesso cada uma pode utilizar.",
  },
};

const toneStyles: Record<Tone, { color: string; background: string }> = {
  teal: { color: "#0ca998", background: "#e4faf6" },
  orange: { color: "#e8892d", background: "#fff3e4" },
  red: { color: "#de5e61", background: "#fff0f0" },
  blue: { color: "#4373df", background: "#edf2ff" },
  lime: { color: "#70951d", background: "#f1f9d9" },
};

const metrics = [
  { label: "OEE médio", value: "82,4%", change: "+4,8%", trend: "up", tone: "teal" as Tone, icon: Gauge, note: "vs. meta 78%" },
  { label: "Produção hoje", value: "128.420", change: "+12,2%", trend: "up", tone: "blue" as Tone, icon: Factory, note: "peças boas" },
  { label: "Refugo", value: "2,8%", change: "-0,6%", trend: "up", tone: "lime" as Tone, icon: TrendingUp, note: "abaixo da meta" },
  { label: "Ordens ativas", value: "18", change: "3 urgentes", trend: "down", tone: "orange" as Tone, icon: ClipboardList, note: "em produção" },
];

const productionBars = [
  { label: "06h", value: 52 },
  { label: "08h", value: 68 },
  { label: "10h", value: 74 },
  { label: "12h", value: 58 },
  { label: "14h", value: 84 },
  { label: "16h", value: 91 },
  { label: "18h", value: 78 },
  { label: "20h", value: 67 },
  { label: "22h", value: 43 },
];

const orders = [
  { id: "OP-4821", product: "Frasco PET 500ml", machine: "INJ-04", mold: "M-1024", progress: 82, status: "Em produção", tone: "teal" as Tone, due: "Hoje, 18:40" },
  { id: "OP-4822", product: "Tampa Flip-top 28mm", machine: "INJ-07", mold: "M-0871", progress: 64, status: "Setup", tone: "orange" as Tone, due: "Hoje, 20:10" },
  { id: "OP-4823", product: "Pote cosmético 250g", machine: "INJ-02", mold: "M-1140", progress: 38, status: "Em produção", tone: "teal" as Tone, due: "Amanhã, 06:00" },
  { id: "OP-4824", product: "Frasco PCR 1L", machine: "INJ-09", mold: "M-0920", progress: 12, status: "Aguardando", tone: "blue" as Tone, due: "Amanhã, 14:20" },
];

const alerts = [
  { title: "Lote RES-2409 em quarentena", detail: "Resultado dimensional pendente", age: "há 18 min", icon: ShieldAlert, tone: "red" as Tone },
  { title: "Troca de molde programada", detail: "INJ-07 · 15:30 — hoje", age: "em 42 min", icon: Wrench, tone: "orange" as Tone },
  { title: "Estoque de masterbatch baixo", detail: "MB-BRANCO-04 · 18% restante", age: "repor hoje", icon: Boxes, tone: "blue" as Tone },
];

const moduleData: Record<string, { metrics: { label: string; value: string; note: string; tone: Tone }[]; headers: string[]; rows: string[][] }> = {
  "/producao": {
    metrics: [
      { label: "OEE da fábrica", value: "82,4%", note: "+4,8% vs. ontem", tone: "teal" },
      { label: "Ciclos no turno", value: "18.420", note: "94% da capacidade", tone: "blue" },
      { label: "Setup médio", value: "38 min", note: "-12 min na semana", tone: "lime" },
      { label: "Paradas abertas", value: "03", note: "1 crítica", tone: "orange" },
    ],
    headers: ["Ordem", "Produto", "Máquina", "Molde", "Progresso", "Status", "Entrega"],
    rows: orders.map((order) => [order.id, order.product, order.machine, order.mold, `${order.progress}%`, order.status, order.due]),
  },
  "/qualidade": {
    metrics: [
      { label: "Aprovação na 1ª", value: "96,8%", note: "+1,4% este mês", tone: "teal" },
      { label: "Lotes em inspeção", value: "07", note: "2 aguardando laudo", tone: "orange" },
      { label: "RNC abertas", value: "04", note: "-3 vs. semana passada", tone: "red" },
      { label: "Liberação média", value: "1h 42m", note: "meta 2h", tone: "blue" },
    ],
    headers: ["Lote", "Material / produto", "Tipo de inspeção", "Responsável", "Status", "Entrada"],
    rows: [
      ["RES-2409", "Resina PET grau alimentício", "Dimensional + visual", "Camila R.", "Em análise", "Hoje, 09:14"],
      ["PIG-0841", "Masterbatch branco", "Concentração", "Rafael M.", "Aprovado", "Hoje, 08:40"],
      ["OP-4818", "Frasco PET 500ml", "Laudo final", "Camila R.", "Quarentena", "Ontem, 17:20"],
      ["RES-2406", "PCR pós-consumo", "Umidade + IV", "João V.", "Aprovado", "Ontem, 15:05"],
    ],
  },
  "/estoque": {
    metrics: [
      { label: "Valor em estoque", value: "R$ 2,84 mi", note: "+6,2% no mês", tone: "blue" },
      { label: "Cobertura média", value: "19 dias", note: "4 itens críticos", tone: "orange" },
      { label: "Acuracidade", value: "98,7%", note: "inventário cíclico", tone: "teal" },
      { label: "Lotes vencendo", value: "06", note: "nos próximos 30 dias", tone: "red" },
    ],
    headers: ["Código", "Material", "Lote", "Saldo", "Local", "Validade", "Situação"],
    rows: [
      ["RES-PET-01", "Resina PET virgem", "PET-24091", "12.400 kg", "Silo 02", "18/03/27", "Normal"],
      ["MB-BRANCO-04", "Masterbatch branco", "MB-0841", "184 kg", "A-03-02", "12/12/26", "Reposição"],
      ["RES-PCR-02", "Resina PCR", "PCR-24062", "4.820 kg", "Big-bag 08", "04/02/27", "Normal"],
      ["EMB-FR-500", "Caixa frasco 500ml", "CX-2610", "1.240 un", "D-01-04", "—", "Baixo giro"],
    ],
  },
  "/manutencao": {
    metrics: [
      { label: "Disponibilidade", value: "91,6%", note: "+2,1% no mês", tone: "teal" },
      { label: "MTBF", value: "184 h", note: "meta 160 h", tone: "blue" },
      { label: "Preventivas em dia", value: "94%", note: "2 vencem esta semana", tone: "lime" },
      { label: "Custo no mês", value: "R$ 48,2 mil", note: "-8,4% vs. orçamento", tone: "orange" },
    ],
    headers: ["Ativo", "Tipo", "Saúde", "Última OS", "Próxima ação", "Ciclos", "Responsável"],
    rows: [
      ["INJ-04 · 320T", "Injetora", "96%", "OS-9182 · 02/10", "Inspeção de rosca", "1.240.822", "Manutenção A"],
      ["M-1024", "Molde 8 cavidades", "82%", "OS-9150 · 28/09", "Lubrificação", "842.110", "Ferramentaria"],
      ["GEL-03", "Chiller", "71%", "OS-9201 · 11/10", "Trocar filtro", "—", "Manutenção B"],
      ["ALIM-07", "Alimentador", "88%", "OS-9174 · 30/09", "Calibrar sensor", "—", "Manutenção A"],
    ],
  },
  "/ordens": {
    metrics: [
      { label: "Ordens abertas", value: "42", note: "18 em produção", tone: "blue" },
      { label: "Atrasadas", value: "03", note: "2 por falta de material", tone: "red" },
      { label: "Programadas hoje", value: "12", note: "86.400 peças", tone: "teal" },
      { label: "OTIF", value: "94,2%", note: "+2,7% vs. mês anterior", tone: "lime" },
    ],
    headers: ["Ordem", "Cliente", "Produto", "Qtd.", "Prioridade", "Status", "Entrega"],
    rows: [
      ["OP-4821", "Farmaplast", "Frasco PET 500ml", "48.000", "Alta", "Em produção", "Hoje, 18:40"],
      ["OP-4822", "Cosmética Viva", "Tampa Flip-top 28mm", "32.000", "Normal", "Setup", "Hoje, 20:10"],
      ["OP-4825", "Nutrivida", "Pote cosmético 250g", "24.000", "Alta", "Planejada", "Amanhã, 08:00"],
      ["OP-4826", "Química Sul", "Frasco PCR 1L", "12.000", "Normal", "Aguardando", "Amanhã, 14:20"],
    ],
  },
  "/financeiro": {
    metrics: [
      { label: "Receita no mês", value: "R$ 4,82 mi", note: "+11,4% vs. mês anterior", tone: "teal" },
      { label: "Margem industrial", value: "27,8%", note: "+2,2 p.p. no mês", tone: "lime" },
      { label: "A receber", value: "R$ 1,18 mi", note: "R$ 240 mil vencem hoje", tone: "orange" },
      { label: "Fluxo projetado", value: "R$ 680 mil", note: "próximos 30 dias", tone: "blue" },
    ],
    headers: ["Competência", "Centro de custo", "Receita", "Custos", "Margem", "Status"],
    rows: [
      ["Out/26", "Injeção · Linha 01", "R$ 1,42 mi", "R$ 1,01 mi", "28,9%", "Conciliado"],
      ["Out/26", "Injeção · Linha 02", "R$ 1,16 mi", "R$ 0,86 mi", "25,9%", "Conciliado"],
      ["Out/26", "Ferramentaria", "R$ 0,74 mi", "R$ 0,48 mi", "35,1%", "Em análise"],
      ["Out/26", "Logística", "R$ 0,38 mi", "R$ 0,31 mi", "18,4%", "Conciliado"],
    ],
  },
};

function StatusPill({ label, tone = "teal" }: { label: string; tone?: Tone }) {
  const style = toneStyles[tone];
  return <span className="status-pill" style={{ color: style.color, background: style.background }}><span className="status-dot" style={{ background: style.color }} />{label}</span>;
}

function MetricCard({ label, value, change, trend, tone, icon: Icon, note }: (typeof metrics)[number]) {
  const style = toneStyles[tone];
  return (
    <article className="metric-card">
      <div className="metric-card__top">
        <span className="metric-label">{label}</span>
        <span className="metric-icon" style={{ color: style.color, background: style.background }}><Icon size={17} strokeWidth={2.2} /></span>
      </div>
      <div className="metric-value">{value}</div>
      <div className="metric-foot">
        <span className={`metric-change ${trend === "down" ? "metric-change--warn" : ""}`}><ArrowUpRight size={14} />{change}</span>
        <span className="metric-note">{note}</span>
      </div>
    </article>
  );
}

function PageHeader({ current, onNewOrder, isLogged, userName }: { current: NavItem; onNewOrder: () => void; isLogged: boolean; userName?: string }) {
  const isDashboard = current.href === "/";
  return (
    <div className="page-header">
      <div>
        <div className="eyebrow">{isDashboard ? "Quinta-feira, 16 de outubro de 2026" : pageCopy[current.href]?.eyebrow}</div>
        <h1>{isDashboard ? <>Bom dia, {isLogged ? userName : "equipe"} <span className="heading-accent">↗</span></> : pageCopy[current.href]?.title}</h1>
        <p>{isDashboard ? "A fábrica está no ritmo. Veja o que merece sua atenção agora." : pageCopy[current.href]?.description}</p>
      </div>
      <div className="header-actions">
        <button className="button button--secondary"><Download size={16} /> Exportar</button>
        <button className="button button--primary" onClick={onNewOrder}><Plus size={17} /> Nova ordem</button>
      </div>
    </div>
  );
}

function ProductionPulse() {
  return (
    <section className="panel panel--pulse">
      <div className="panel-heading">
        <div><span className="panel-kicker">Performance</span><h2>Ritmo de produção</h2></div>
        <button className="select-button">Hoje <ChevronDown size={15} /></button>
      </div>
      <div className="pulse-summary"><strong>128.420</strong><span>peças boas <span className="positive">+12,2%</span></span></div>
      <div className="chart-area" aria-label="Gráfico de produção por hora">
        <div className="chart-y-labels"><span>100k</span><span>75k</span><span>50k</span><span>25k</span><span>0</span></div>
        <div className="chart-grid">
          <div className="chart-grid__line" /><div className="chart-grid__line" /><div className="chart-grid__line" /><div className="chart-grid__line" /><div className="chart-grid__line" />
          <div className="bars">
            {productionBars.map((bar, index) => <div className="bar-column" key={bar.label}><div className={`bar ${index === 5 ? "bar--active" : ""}`} style={{ height: `${bar.value}%` }}><span>{index === 5 ? "91k" : ""}</span></div><small>{bar.label}</small></div>)}
          </div>
        </div>
      </div>
      <div className="chart-legend"><span><i className="legend-dot legend-dot--teal" /> Produção boa</span><span><i className="legend-dot legend-dot--muted" /> Refugo <b>2,8%</b></span><span className="chart-target">Meta diária <b>140k</b></span></div>
    </section>
  );
}

function FactoryStatus() {
  const lines = [
    { name: "Linha 01", machine: "INJ-04 · 320T", oee: "91%", state: "Rodando", tone: "teal" as Tone, progress: 91 },
    { name: "Linha 02", machine: "INJ-07 · 180T", oee: "78%", state: "Setup", tone: "orange" as Tone, progress: 78 },
    { name: "Linha 03", machine: "INJ-02 · 250T", oee: "86%", state: "Rodando", tone: "teal" as Tone, progress: 86 },
    { name: "Linha 04", machine: "INJ-09 · 450T", oee: "—", state: "Aguardando", tone: "blue" as Tone, progress: 34 },
  ];
  return (
    <section className="panel panel--status">
      <div className="panel-heading"><div><span className="panel-kicker">Tempo real</span><h2>Status da fábrica</h2></div><button className="icon-button"><MoreHorizontal size={18} /></button></div>
      <div className="line-list">
        {lines.map((line) => <div className="line-row" key={line.name}><div className="line-row__name"><span className={`machine-orb machine-orb--${line.tone}`}><Activity size={15} /></span><div><b>{line.name}</b><small>{line.machine}</small></div></div><div className="line-row__score"><strong>{line.oee}</strong><div className="mini-progress"><span style={{ width: `${line.progress}%`, background: toneStyles[line.tone].color }} /></div></div><StatusPill label={line.state} tone={line.tone} /></div>)}
      </div>
      <Link href="/producao" className="panel-link">Ver todas as linhas <ChevronRight size={15} /></Link>
    </section>
  );
}

function OrdersPanel() {
  return (
    <section className="panel panel--orders">
      <div className="panel-heading"><div><span className="panel-kicker">Fila de hoje</span><h2>Ordens em andamento</h2></div><Link href="/ordens" className="text-button">Ver todas <ChevronRight size={15} /></Link></div>
      <div className="orders-table-wrap"><table className="orders-table"><thead><tr><th>Ordem</th><th>Produto / máquina</th><th>Progresso</th><th>Status</th><th>Entrega</th><th /></tr></thead><tbody>{orders.map((order) => <tr key={order.id}><td><b className="order-id">{order.id}</b></td><td><div className="product-cell"><b>{order.product}</b><span>{order.machine} · {order.mold}</span></div></td><td><div className="progress-cell"><div className="progress-track"><span style={{ width: `${order.progress}%`, background: toneStyles[order.tone].color }} /></div><small>{order.progress}%</small></div></td><td><StatusPill label={order.status} tone={order.tone} /></td><td className="muted-cell">{order.due}</td><td><button className="row-more"><MoreHorizontal size={17} /></button></td></tr>)}</tbody></table></div>
    </section>
  );
}

function AlertsPanel() {
  return (
    <section className="panel panel--alerts">
      <div className="panel-heading"><div><span className="panel-kicker">Atenção</span><h2>Alertas inteligentes</h2></div><span className="alert-count">3 novos</span></div>
      <div className="alert-list">{alerts.map((alert) => { const style = toneStyles[alert.tone]; return <div className="alert-row" key={alert.title}><span className="alert-icon" style={{ color: style.color, background: style.background }}><alert.icon size={16} /></span><div className="alert-copy"><b>{alert.title}</b><span>{alert.detail}</span></div><small>{alert.age}</small></div>; })}</div>
      <Link href="/qualidade" className="panel-link">Abrir central de alertas <ChevronRight size={15} /></Link>
    </section>
  );
}

function Dashboard({ onNewOrder, isLogged, userName }: { onNewOrder: () => void; isLogged: boolean; userName?: string }) {
  return <>
    <PageHeader current={navItems[0]} onNewOrder={onNewOrder} isLogged={isLogged} userName={userName} />
    <div className="metrics-grid">{metrics.map((metric) => <MetricCard key={metric.label} {...metric} />)}</div>
    <div className="dashboard-grid dashboard-grid--top"><ProductionPulse /><FactoryStatus /></div>
    <div className="dashboard-grid dashboard-grid--bottom"><OrdersPanel /><AlertsPanel /></div>
  </>;
}

function ModulePage({ current, onNewOrder, isLogged, userName }: { current: NavItem; onNewOrder: () => void; isLogged: boolean; userName?: string }) {
  const data = moduleData[current.href];
  if (!data) return <SettingsPage current={current} onNewOrder={onNewOrder} isLogged={isLogged} userName={userName} />;
  return <>
    <PageHeader current={current} onNewOrder={onNewOrder} isLogged={isLogged} userName={userName} />
    <div className="metrics-grid">{data.metrics.map((metric) => <article className="metric-card" key={metric.label}><div className="metric-card__top"><span className="metric-label">{metric.label}</span><span className="metric-signal" style={{ background: toneStyles[metric.tone].background, color: toneStyles[metric.tone].color }}><Sparkles size={15} /></span></div><div className="metric-value">{metric.value}</div><div className="metric-foot"><span className="metric-note metric-note--strong" style={{ color: toneStyles[metric.tone].color }}>{metric.note}</span></div></article>)}</div>
    <section className="panel module-panel">
      <div className="panel-heading"><div><span className="panel-kicker">Visão detalhada</span><h2>{current.label} em foco</h2></div><div className="table-actions"><button className="button button--secondary button--compact"><Search size={15} /> Buscar</button><button className="button button--secondary button--compact"><SlidersIcon /> Filtros</button></div></div>
      <div className="module-table-wrap"><table className="module-table"><thead><tr>{data.headers.map((header) => <th key={header}>{header}</th>)}<th /></tr></thead><tbody>{data.rows.map((row, index) => <tr key={`${row[0]}-${index}`}>{row.map((cell, cellIndex) => <td key={`${cell}-${cellIndex}`} className={cellIndex === 0 ? "module-primary" : cellIndex === row.length - 1 ? "muted-cell" : ""}>{cellIndex === row.length - 2 && ["Em produção", "Aprovado", "Normal", "Conciliado", "Rodando"].includes(cell) ? <StatusPill label={cell} tone="teal" /> : cellIndex === row.length - 2 && ["Setup", "Reposição", "Em análise", "Baixo giro", "Planejada"].includes(cell) ? <StatusPill label={cell} tone="orange" /> : cellIndex === row.length - 2 && ["Quarentena", "Atrasada"].includes(cell) ? <StatusPill label={cell} tone="red" /> : cell}</td>)}<td><button className="row-more"><MoreHorizontal size={17} /></button></td></tr>)}</tbody></table></div>
      <div className="table-footer"><span>Mostrando <b>{data.rows.length}</b> de 42 registros</span><div className="pagination"><button className="page-button page-button--active">1</button><button className="page-button">2</button><button className="page-button">3</button><button className="page-button"><ChevronRight size={14} /></button></div></div>
    </section>
  </>;
}

function RestrictedPage({ current, onNewOrder, onLogin }: { current: NavItem; onNewOrder: () => void; onLogin: () => void }) {
  return <><PageHeader current={current} onNewOrder={onNewOrder} isLogged={false} /><section className="restricted-panel"><div className="restricted-panel__icon"><LockKeyhole size={25} /></div><span className="eyebrow">Módulo protegido</span><h2>Acesso autorizado necessário</h2><p>O conteúdo de <b>{current.label}</b> é reservado para pessoas com permissão neste setor. Faça login para validar seu perfil e manter a rastreabilidade das consultas e ações.</p><button className="button button--primary" onClick={onLogin}><LogIn size={16} /> Entrar para acessar</button><div className="restricted-panel__note"><ShieldCheck size={15} /> Acesso público continua disponível para Dashboard, Produção, Qualidade, Estoque, Manutenção e Ordens.</div></section></>;
}

function RhPage({ onNewOrder, isLogged, userName }: { onNewOrder: () => void; isLogged: boolean; userName?: string }) {
  const people = [
    ["Mariana Costa", "Operadora · Linha 01", "06:58", "No posto", "teal" as Tone],
    ["Rafael Mendes", "Preparador · Linha 02", "07:04", "No posto", "teal" as Tone],
    ["Camila Rocha", "Qualidade", "08:12", "Atraso 12 min", "orange" as Tone],
    ["João Vieira", "Manutenção", "—", "Falta justificada", "blue" as Tone],
  ];
  return <>
    <PageHeader current={navItems.find((item) => item.href === "/rh") ?? navItems[0]} onNewOrder={onNewOrder} isLogged={isLogged} userName={userName} />
    <div className="metrics-grid rh-metrics">
      {[{ label: "Presentes agora", value: "86", note: "de 94 escalados", tone: "teal" as Tone, icon: Users }, { label: "Pontos registrados", value: "91,5%", note: "hoje · 06:00–09:00", tone: "blue" as Tone, icon: Clock3 }, { label: "Atrasos", value: "07", note: "2 acima de 15 min", tone: "orange" as Tone, icon: CalendarDays }, { label: "Ausências", value: "08", note: "3 aguardando justificativa", tone: "red" as Tone, icon: MapPin }].map((metric) => <article className="metric-card" key={metric.label}><div className="metric-card__top"><span className="metric-label">{metric.label}</span><span className="metric-signal" style={{ color: toneStyles[metric.tone].color, background: toneStyles[metric.tone].background }}><metric.icon size={16} /></span></div><div className="metric-value">{metric.value}</div><div className="metric-foot"><span className="metric-note metric-note--strong" style={{ color: toneStyles[metric.tone].color }}>{metric.note}</span></div></article>)}
    </div>
    <div className="rh-grid">
      <section className="panel rh-presence-panel"><div className="panel-heading"><div><span className="panel-kicker">Tempo real</span><h2>Quem está na fábrica</h2></div><button className="button button--secondary button--compact"><Download size={14} /> Exportar</button></div><div className="presence-summary"><div><b>86</b><span>presentes</span></div><div><b>08</b><span>ausentes</span></div><div><b>04</b><span>em intervalo</span></div></div><div className="presence-list">{people.map(([name, role, time, state, tone]) => <div className="presence-row" key={name}><span className="presence-avatar">{name.split(" ").map((part) => part[0]).join("").slice(0, 2)}</span><div className="presence-person"><b>{name}</b><small>{role}</small></div><span className="presence-time">{time}</span><StatusPill label={state} tone={tone as Tone} /></div>)}</div><button className="panel-link panel-link--button">Ver quadro completo <ChevronRight size={15} /></button></section>
      <section className="panel rh-shifts-panel"><div className="panel-heading"><div><span className="panel-kicker">Escalas de hoje</span><h2>Distribuição por turno</h2></div><button className="icon-button"><MoreHorizontal size={18} /></button></div><div className="shift-list"><div className="shift-row"><span className="shift-badge shift-badge--teal">1º</span><div><b>06:00 — 14:00</b><small>Produção e qualidade</small></div><strong>42 / 44</strong></div><div className="shift-row"><span className="shift-badge shift-badge--orange">2º</span><div><b>14:00 — 22:00</b><small>Produção e manutenção</small></div><strong>38 / 40</strong></div><div className="shift-row"><span className="shift-badge shift-badge--blue">3º</span><div><b>22:00 — 06:00</b><small>Operação reduzida</small></div><strong>06 / 10</strong></div></div><div className="rh-location-note"><MapPin size={14} /><span>82 registros validados por GPS ou rede local</span></div></section>
    </div>
    <section className="panel rh-report-panel"><div className="panel-heading"><div><span className="panel-kicker">Relatório de ponto</span><h2>Batidas e ocorrências de hoje</h2></div><div className="table-actions"><button className="button button--secondary button--compact"><CalendarDays size={14} /> 16 out. 2026</button><button className="button button--primary button--compact"><Download size={14} /> Baixar relatório</button></div></div><div className="module-table-wrap"><table className="module-table rh-table"><thead><tr><th>Colaborador</th><th>Entrada</th><th>Intervalo</th><th>Saída prevista</th><th>Origem</th><th>Situação</th><th /></tr></thead><tbody>{[["Mariana Costa", "06:58", "11:58", "14:00", "Rede local", "Regular", "teal"], ["Rafael Mendes", "07:04", "12:01", "14:00", "GPS validado", "Regular", "teal"], ["Camila Rocha", "08:12", "—", "17:00", "GPS validado", "Atraso", "orange"], ["João Vieira", "—", "—", "17:00", "Justificativa", "Ausência", "blue"]].map((row) => <tr key={row[0]}>{row.slice(0, 5).map((cell, index) => <td key={cell} className={index === 0 ? "module-primary" : index === 4 ? "muted-cell" : ""}>{cell}</td>)}<td><StatusPill label={row[5]} tone={row[6] as Tone} /></td><td><button className="row-more"><MoreHorizontal size={17} /></button></td></tr>)}</tbody></table></div></section>
  </>;
}

function UsersAccessPage({ onNewOrder, isLogged, userName }: { onNewOrder: () => void; isLogged: boolean; userName?: string }) {
  const [role, setRole] = useState("Supervisor de produção");
  const [selectedModules, setSelectedModules] = useState(["Produção", "Qualidade", "Estoque"]);
  const modules = ["Dashboard", "Produção", "Qualidade", "Estoque", "Manutenção", "RH & ponto", "Financeiro", "Fiscal e contábil", "Documentos"];
  const toggleModule = (module: string) => setSelectedModules((current) => current.includes(module) ? current.filter((item) => item !== module) : [...current, module]);
  return <>
    <PageHeader current={navItems.find((item) => item.href === "/usuarios") ?? navItems[0]} onNewOrder={onNewOrder} isLogged={isLogged} userName={userName} />
    <div className="access-layout"><section className="panel user-form-panel"><div className="panel-heading"><div><span className="panel-kicker">Novo cadastro</span><h2>Adicionar usuário</h2></div><span className="settings-icon settings-icon--small"><UserPlus size={17} /></span></div><div className="form-grid"><label className="modal-field"><span>Nome completo</span><input placeholder="Ex.: Ana Paula Souza" /></label><label className="modal-field"><span>E-mail corporativo</span><input placeholder="ana@empresa.com.br" /></label><label className="modal-field"><span>Número de registro</span><input placeholder="REG-00000" /></label><label className="modal-field"><span>Setor</span><select defaultValue="Produção"><option>Produção</option><option>Qualidade</option><option>RH</option><option>Manutenção</option><option>Financeiro</option></select></label></div><div className="access-section"><div className="access-section__heading"><div><span className="panel-kicker">Nível de acesso</span><b>Escolha o papel principal</b></div><select value={role} onChange={(event) => setRole(event.target.value)}><option>Administrador</option><option>Supervisor de produção</option><option>Operador</option><option>Qualidade</option><option>Consulta</option></select></div><p>O papel sugere permissões iniciais, mas você pode ajustar módulo por módulo abaixo.</p></div><div className="access-section"><div className="access-section__heading"><div><span className="panel-kicker">Permissões por módulo</span><b>O que esta pessoa poderá acessar?</b></div><span className="selection-count">{selectedModules.length} selecionados</span></div><div className="module-check-grid">{modules.map((module) => <label className={`module-check ${selectedModules.includes(module) ? "module-check--selected" : ""}`} key={module}><input type="checkbox" checked={selectedModules.includes(module)} onChange={() => toggleModule(module)} /><span className="check-box">{selectedModules.includes(module) ? "✓" : ""}</span><span>{module}</span></label>)}</div></div><div className="user-form-actions"><button className="button button--secondary">Cancelar</button><button className="button button--primary" onClick={() => toast.success("Usuário pronto para cadastro", { description: `${role} · ${selectedModules.length} módulos selecionados.` })}><UserPlus size={15} /> Cadastrar usuário</button></div></section><section className="panel access-preview-panel"><div className="panel-heading"><div><span className="panel-kicker">Prévia de acesso</span><h2>Como ficará para a pessoa</h2></div><ShieldCheck size={18} color="var(--teal-dark)" /></div><div className="access-user-preview"><span className="preview-avatar">AP</span><div><b>Ana Paula Souza</b><small>REG-00000 · {role}</small></div></div><div className="preview-divider" /><span className="panel-kicker">Pode acessar</span><div className="preview-permissions">{selectedModules.map((module) => <span key={module}><CheckCircle2 size={13} />{module}</span>)}</div><div className="preview-note"><LockKeyhole size={14} /><span>Toda ação será registrada com usuário, registro, data/hora e módulo.</span></div></section></div>
    <section className="panel user-list-panel"><div className="panel-heading"><div><span className="panel-kicker">Usuários cadastrados</span><h2>Controle de acesso da equipe</h2></div><button className="button button--secondary button--compact"><Search size={14} /> Buscar usuário</button></div><div className="module-table-wrap"><table className="module-table"><thead><tr><th>Usuário</th><th>Registro</th><th>Perfil</th><th>Módulos</th><th>Último acesso</th><th>Status</th><th /></tr></thead><tbody>{[["Carlos Ribeiro", "REG-00012", "Administrador", "Todos", "Hoje, 09:21", "Ativo", "teal"], ["Ana Paula Souza", "REG-00027", "Supervisor de produção", "3 módulos", "Hoje, 08:57", "Convite pendente", "orange"], ["Mariana Costa", "REG-00041", "Operadora", "Produção · RH", "Hoje, 06:58", "Ativo", "teal"]].map((row) => <tr key={row[0]}><td className="module-primary">{row[0]}</td><td>{row[1]}</td><td>{row[2]}</td><td className="muted-cell">{row[3]}</td><td className="muted-cell">{row[4]}</td><td><StatusPill label={row[5]} tone={row[6] as Tone} /></td><td><button className="row-more"><MoreHorizontal size={17} /></button></td></tr>)}</tbody></table></div></section>
  </>;
}

function SettingsPage({ current, onNewOrder, isLogged, userName }: { current: NavItem; onNewOrder: () => void; isLogged: boolean; userName?: string }) {
  const cards = [
    { title: "Dados mestres", description: "Produtos, moldes, injetoras, clientes e fornecedores.", icon: DatabaseIcon, tone: "teal" as Tone, action: "Gerenciar cadastros" },
    { title: "Usuários e permissões", description: "Papéis, acessos por módulo e trilha de auditoria.", icon: UserRound, tone: "blue" as Tone, action: "Ver usuários" },
    { title: "Integrações", description: "Balanças, EDI, fiscal, IoT e notificações.", icon: PlugIcon, tone: "orange" as Tone, action: "Conectar serviço" },
    { title: "Regras de qualidade", description: "Barreiras, amostragens, laudos e quarentena.", icon: ShieldCheck, tone: "lime" as Tone, action: "Editar regras" },
  ];
  return <><PageHeader current={current} onNewOrder={onNewOrder} isLogged={isLogged} userName={userName} /><section className="settings-grid">{cards.map((card) => { const style = toneStyles[card.tone]; return <article className="settings-card" key={card.title}><span className="settings-icon" style={{ color: style.color, background: style.background }}><card.icon size={19} /></span><h2>{card.title}</h2><p>{card.description}</p><button className="panel-link panel-link--button">{card.action}<ChevronRight size={15} /></button></article>; })}</section><section className="panel system-health"><div className="panel-heading"><div><span className="panel-kicker">Monitoramento</span><h2>Saúde do sistema</h2></div><StatusPill label="Tudo operando" tone="teal" /></div><div className="health-grid"><div><span>API e integrações</span><b>99,98%</b><small>últimos 30 dias</small></div><div><span>Eventos de chão de fábrica</span><b>2.840/min</b><small>processamento normal</small></div><div><span>Último backup</span><b>Hoje, 03:00</b><small>retido por 90 dias</small></div></div></section></>;
}

function SlidersIcon() { return <span className="sliders-icon"><span /><span /><span /></span>; }
function DatabaseIcon({ size = 19 }: { size?: number }) { return <span className="database-icon" style={{ width: size, height: size }}><span /></span>; }
function PlugIcon({ size = 19 }: { size?: number }) { return <span className="plug-icon" style={{ width: size, height: size }}>↗</span>; }

function AccessModal({ mode, isLogged, userName, onClose, onLogin, onAction }: { mode: "login" | "record"; isLogged: boolean; userName?: string; onClose: () => void; onLogin: (name: string, record: string) => void; onAction: (record: string) => void }) {
  const [name, setName] = useState("");
  const [record, setRecord] = useState("");
  const isLogin = mode === "login";
  return <div className="modal-backdrop" role="dialog" aria-modal="true"><div className="access-modal"><button className="modal-close" onClick={onClose}><X size={18} /></button><div className="access-modal__icon"><ShieldCheck size={21} /></div><span className="eyebrow">Rastreabilidade obrigatória</span><h2>{isLogin ? "Entre para operar" : "Confirme seu registro"}</h2><p>{isLogin ? "O acesso público permite consultar a operação. Para apontar ou alterar qualquer dado, identifique-se." : `Toda ação fica vinculada ao registro de quem realizou. ${userName ? `Operador: ${userName}.` : ""}`}</p>{isLogin && <label className="modal-field"><span>Nome completo</span><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: João da Silva" /></label>}<label className="modal-field"><span>Número de registro</span><input value={record} onChange={(event) => setRecord(event.target.value)} placeholder="Ex.: REG-00482" /></label><div className="modal-hint"><LockKeyhole size={14} /> O registro será salvo no histórico da ação.</div><button className="button button--primary modal-submit" disabled={(isLogin && !name.trim()) || !record.trim()} onClick={() => isLogin ? onLogin(name.trim(), record.trim()) : onAction(record.trim())}>{isLogin ? "Entrar e continuar" : "Confirmar apontamento"}<ChevronRight size={16} /></button><button className="modal-cancel" onClick={onClose}>Cancelar</button></div></div>;
}

export default function Home() {
  const [location, navigate] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [isLogged, setIsLogged] = useState(false);
  const [user, setUser] = useState<{ name: string; record: string } | null>(null);
  const [accessModal, setAccessModal] = useState<"login" | "record" | null>(null);
  const current = useMemo(() => navItems.find((item) => item.href === location) ?? navItems[0], [location]);

  const handleNewOrder = () => setAccessModal("record");
  const handleLogin = (name: string, record: string) => { setUser({ name, record }); setIsLogged(true); setAccessModal(null); toast.success(`Bem-vindo, ${name}`, { description: `Registro ${record} vinculado à sua sessão.` }); };
  const handleAction = (record: string) => { setUser((currentUser) => currentUser ? { ...currentUser, record } : currentUser); setAccessModal(null); toast.success("Apontamento autorizado", { description: `Ação registrada por ${user?.name ?? "operador identificado"} · ${record}.` }); };
  const handleRestrictedNavigation = (item: NavItem) => { if (item.restricted && !isLogged) { toast.info("Acesso autorizado necessário", { description: `Entre para acessar ${item.label} e manter a rastreabilidade.` }); setAccessModal("login"); return; } navigate(item.href); setMobileOpen(false); };
  const handleNotification = () => toast("Você está em dia", { description: "Não há novas notificações além dos 3 alertas operacionais." });
  const handleSearch = (event: React.FormEvent) => { event.preventDefault(); if (search.trim()) toast.info(`Busca por “${search.trim()}”`, { description: "A busca global será conectada aos dados reais na próxima etapa." }); };

  return <div className="app-shell">
    <aside className={`sidebar ${mobileOpen ? "sidebar--open" : ""}`}>
      <div className="brand"><span className="brand-mark"><span>IF</span></span><span className="brand-name">injeta<span>flow</span></span><span className="brand-badge">ERP</span><button className="mobile-close" onClick={() => setMobileOpen(false)}><X size={18} /></button></div>
      <div className="workspace-switcher"><span className="workspace-avatar">FP</span><span><small>Unidade ativa</small><b>Fábrica Paulista</b></span><ChevronDown size={15} /></div>
      <nav className="sidebar-nav">{navItems.map((item) => <div key={item.href}>{item.section && <span className="nav-section">{item.section}</span>}<button className={`nav-item ${current.href === item.href ? "nav-item--active" : ""} ${item.restricted ? "nav-item--restricted" : ""}`} onClick={() => handleRestrictedNavigation(item)}><item.icon size={18} strokeWidth={current.href === item.href ? 2.4 : 1.9} /><span>{item.label}</span>{item.restricted && <LockKeyhole size={13} className="nav-lock" />}{item.label === "Qualidade" && <span className="nav-alert">3</span>}</button></div>)}</nav>
      <div className="sidebar-bottom"><div className="help-card"><span className="help-spark"><Sparkles size={16} /></span><div><b>Precisa de ajuda?</b><small>Fale com seu especialista</small></div><ChevronRight size={15} /></div>{isLogged ? <button className="user-card"><span className="user-avatar">{user?.name.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</span><span><b>{user?.name}</b><small>Registro {user?.record}</small></span><MoreHorizontal size={17} /></button> : <button className="public-user-card" onClick={() => setAccessModal("login")}><span className="public-user-icon"><UserRound size={15} /></span><span><b>Acesso público</b><small>Entrar para operar</small></span><LogIn size={15} /></button>}</div>
    </aside>
    {mobileOpen && <button className="sidebar-overlay" aria-label="Fechar menu" onClick={() => setMobileOpen(false)} />}
    <main className="main-content">
      <header className="topbar"><button className="mobile-menu" onClick={() => setMobileOpen(true)}><Menu size={20} /></button><form className="global-search" onSubmit={handleSearch}><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar ordens, lotes, produtos..." /><kbd>⌘ K</kbd></form><div className="topbar-actions"><span className={`access-mode ${isLogged ? "access-mode--logged" : ""}`}><span className="access-mode__dot" />{isLogged ? `Registro ${user?.record}` : "Acesso público"}</span><div className="topbar-date"><CalendarClock size={16} /><span>16 out. 2026</span><ChevronDown size={14} /></div><button className="topbar-icon" onClick={handleNotification}><span className="notification-dot" /><BellIcon /></button>{isLogged ? <div className="topbar-avatar">{user?.name.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</div> : <button className="login-button" onClick={() => setAccessModal("login")}><LogIn size={14} /> Entrar</button>}</div></header>
      <div className="page-content">{current.href === "/" ? <Dashboard onNewOrder={handleNewOrder} isLogged={isLogged} userName={user?.name} /> : current.restricted && !isLogged ? <RestrictedPage current={current} onNewOrder={handleNewOrder} onLogin={() => setAccessModal("login")} /> : current.href === "/rh" ? <RhPage onNewOrder={handleNewOrder} isLogged={isLogged} userName={user?.name} /> : current.href === "/usuarios" ? <UsersAccessPage onNewOrder={handleNewOrder} isLogged={isLogged} userName={user?.name} /> : current.href === "/configuracoes" ? <SettingsPage current={current} onNewOrder={handleNewOrder} isLogged={isLogged} userName={user?.name} /> : <ModulePage current={current} onNewOrder={handleNewOrder} isLogged={isLogged} userName={user?.name} />}</div>
      <footer className="app-footer"><span><span className="footer-pulse" /> Dados atualizados há 28 segundos</span><span>InjetaFlow ERP <b>v0.1 preview</b></span></footer>
    </main>
    {accessModal && <AccessModal mode={accessModal} isLogged={isLogged} userName={user?.name} onClose={() => setAccessModal(null)} onLogin={handleLogin} onAction={handleAction} />}
  </div>;
}

function BellIcon() { return <span className="bell-icon"><span /></span>; }
