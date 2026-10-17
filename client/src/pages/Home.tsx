import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { authenticateDemoUser, isDemoAdmin } from "@/lib/demo-auth";
import {
  Activity,
  ArrowLeft,
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
  Mail,
  KeyRound,
  History,
  FileText,
  Star,
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
  Upload,
  QrCode,
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
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, section: "Visão geral" },
  { label: "Produção", href: "/producao", icon: Factory, section: "Operação" },
  { label: "Moldes & ferramentaria", href: "/moldes", icon: Wrench, section: "Engenharia", restricted: true },
  { label: "Matéria-prima", href: "/materia-prima", icon: Boxes, restricted: true },
  { label: "Pigmentos & cores", href: "/pigmentos", icon: Sparkles, restricted: true },
  { label: "Qualidade", href: "/qualidade", icon: ShieldCheck },
  { label: "Estoque", href: "/estoque", icon: Boxes },
  { label: "Manutenção", href: "/manutencao", icon: Wrench },
  { label: "RH & ponto", href: "/rh", icon: Users, section: "Pessoas", restricted: true },
  { label: "Ordens", href: "/ordens", icon: ClipboardList, section: "Gestão" },
  { label: "Financeiro", href: "/financeiro", icon: WalletCards, restricted: true },
  { label: "Usuários e acessos", href: "/usuarios", icon: UserRound, section: "Sistema", restricted: true },
  { label: "Configurações", href: "/configuracoes", icon: Settings2, section: "Sistema", restricted: true },
  { label: "Meu perfil", href: "/meu-perfil", icon: UserRound, section: "Minha conta", restricted: true },
];

const pageCopy: Record<string, { eyebrow: string; title: string; description: string }> = {
  "/producao": {
    eyebrow: "Centro de comando",
    title: "Produção",
    description: "Acompanhe o ritmo da fábrica e ajuste a programação sem perder o próximo ciclo.",
  },
  "/moldes": { eyebrow: "Engenharia e ferramentaria", title: "Moldes & ferramentaria", description: "Controle o ciclo de vida dos moldes, cavidades, manutenções, ajustes e disponibilidade por máquina." },
  "/materia-prima": { eyebrow: "Materiais controlados", title: "Matéria-prima", description: "Rastreie resinas, aditivos, cargas, lotes, validade, silos, big-bags e consumo por ordem." },
  "/pigmentos": { eyebrow: "Desenvolvimento de cores", title: "Pigmentos & cores", description: "Gerencie masterbatch, formulações, padrões de cor, testes e aprovação por produto." },
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
  "/meu-perfil": {
    eyebrow: "Minha área",
    title: "Meu perfil",
    description: "Consulte seus acessos, jornada, avaliações, faltas e o histórico das suas atividades.",
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
  "/moldes": {
    metrics: [
      { label: "Moldes cadastrados", value: "186", note: "42 ativos hoje", tone: "blue" },
      { label: "Disponibilidade", value: "92,8%", note: "+3,1% no mês", tone: "teal" },
      { label: "Preventivas vencendo", value: "07", note: "nos próximos 14 dias", tone: "orange" },
      { label: "Cavidades ativas", value: "1.248", note: "de 1.296 instaladas", tone: "lime" },
    ],
    headers: ["Molde", "Produto", "Cavidades", "Ciclos", "Última manutenção", "Próxima ação", "Status"],
    rows: [
      ["M-1024", "Frasco PET 500ml", "8 / 8", "842.110", "28/09/26", "Lubrificação", "Disponível"],
      ["M-0871", "Tampa Flip-top 28mm", "16 / 16", "1.204.820", "04/10/26", "Troca de inserto", "Em uso"],
      ["M-1140", "Pote cosmético 250g", "4 / 4", "388.420", "12/09/26", "Inspeção dimensional", "Atenção"],
      ["M-0920", "Frasco PCR 1L", "2 / 2", "96.240", "08/10/26", "—", "Disponível"],
    ],
  },
  "/materia-prima": {
    metrics: [
      { label: "Resinas em estoque", value: "42,8 t", note: "19 dias de cobertura", tone: "blue" },
      { label: "Lotes rastreados", value: "128", note: "100% identificados", tone: "teal" },
      { label: "Em quarentena", value: "03", note: "aguardando laudo", tone: "orange" },
      { label: "Validade crítica", value: "06", note: "próximos 30 dias", tone: "red" },
    ],
    headers: ["Código", "Material", "Lote", "Origem", "Saldo", "Validade", "Status"],
    rows: [
      ["RES-PET-01", "PET virgem grau alimentício", "PET-24091", "Fornecedor A", "12.400 kg", "18/03/27", "Liberado"],
      ["RES-PCR-02", "PCR pós-consumo", "PCR-24062", "Fornecedor B", "4.820 kg", "04/02/27", "Liberado"],
      ["AD-UV-03", "Aditivo UV", "UV-2610", "Fornecedor C", "320 kg", "21/11/26", "Atenção"],
      ["RES-ABS-07", "ABS natural", "ABS-24018", "Fornecedor D", "1.180 kg", "09/12/26", "Quarentena"],
    ],
  },
  "/pigmentos": {
    metrics: [
      { label: "Cores ativas", value: "74", note: "padrões aprovados", tone: "blue" },
      { label: "Masterbatch em estoque", value: "2,4 t", note: "34 SKUs disponíveis", tone: "teal" },
      { label: "Testes em aprovação", value: "05", note: "aguardando qualidade", tone: "orange" },
      { label: "Aderência de cor", value: "98,2%", note: "últimos 90 dias", tone: "lime" },
    ],
    headers: ["Código", "Cor / aplicação", "Masterbatch", "Concentração", "Padrão", "Último teste", "Status"],
    rows: [
      ["COR-BR-04", "Branco tampa 28mm", "MB-BRANCO-04", "2,0%", "RAL 9003", "14/10/26", "Aprovado"],
      ["COR-AZ-12", "Azul frasco 500ml", "MB-AZUL-12", "1,4%", "Amostra AP-12", "13/10/26", "Aprovado"],
      ["COR-VD-08", "Verde linha alimentícia", "MB-VERDE-08", "1,8%", "Pantone 361C", "12/10/26", "Em teste"],
      ["COR-NT-01", "Natural translúcido", "—", "—", "Padrão interno", "10/10/26", "Aprovado"],
    ],
  },
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

function PageHeader({ current, onNewOrder, isLogged, userName }: { current: NavItem; onNewOrder: (context?: NavItem) => void; isLogged: boolean; userName?: string }) {
  const isDashboard = current.href === "/dashboard";
  return (
    <div className="page-header">
      <div>
        <div className="eyebrow">{isDashboard ? "Quinta-feira, 16 de outubro de 2026" : pageCopy[current.href]?.eyebrow}</div>
        <h1>{isDashboard ? <>Bom dia, {isLogged ? userName : "equipe"} <span className="heading-accent">↗</span></> : pageCopy[current.href]?.title}</h1>
        <p>{isDashboard ? "A fábrica está no ritmo. Veja o que merece sua atenção agora." : pageCopy[current.href]?.description}</p>
      </div>
      <div className="header-actions">
        <button className="button button--secondary"><Download size={16} /> Exportar</button>
        <button className="button button--primary" onClick={() => onNewOrder(current)}><Plus size={17} /> Nova ordem</button>
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


type ActionField = {
  label: string;
  name: string;
  type?: "text" | "email" | "number" | "date" | "textarea" | "select";
  placeholder?: string;
  options?: string[];
  required?: boolean;
};

type ActionDefinition = { title: string; description: string; fields: ActionField[] };

const actionDefinitions: Record<string, ActionDefinition> = {
  "/dashboard": { title: "Nova ordem de produção", description: "Informe os dados essenciais para planejar uma nova ordem de injeção.", fields: [
    { label: "Produto", name: "produto", placeholder: "Ex.: Frasco PET 500ml", required: true },
    { label: "Molde e máquina", name: "moldeMaquina", placeholder: "Ex.: M-1024 · INJ-04", required: true },
    { label: "Quantidade planejada", name: "quantidade", type: "number", placeholder: "Ex.: 25.000", required: true },
    { label: "Prioridade", name: "prioridade", type: "select", options: ["Normal", "Alta", "Urgente"], required: true },
    { label: "Entrega prevista", name: "entrega", type: "date", required: true },
    { label: "Observações da programação", name: "observacoes", type: "textarea", placeholder: "Setup, matéria-prima, embalagem ou instruções especiais..." },
  ] },
  "/producao": { title: "Nova ordem de produção", description: "Programe produto, máquina, quantidade e prazo para a operação.", fields: [
    { label: "Produto", name: "produto", placeholder: "Ex.: Tampa Flip-top 28mm", required: true },
    { label: "Molde", name: "molde", placeholder: "Código do molde", required: true },
    { label: "Máquina", name: "maquina", placeholder: "Ex.: INJ-07 · 180T", required: true },
    { label: "Quantidade planejada", name: "quantidade", type: "number", required: true },
    { label: "Data de início", name: "inicio", type: "date", required: true },
    { label: "Notas para a produção", name: "notas", type: "textarea", placeholder: "Resina, pigmento, setup ou instruções..." },
  ] },
  "/ordens": { title: "Nova ordem de produção", description: "Crie uma ordem com rastreabilidade de produto, molde e máquina.", fields: [
    { label: "Produto", name: "produto", placeholder: "Produto a fabricar", required: true },
    { label: "Código do molde", name: "molde", placeholder: "Ex.: M-1024", required: true },
    { label: "Quantidade", name: "quantidade", type: "number", required: true },
    { label: "Prioridade", name: "prioridade", type: "select", options: ["Normal", "Alta", "Urgente"], required: true },
    { label: "Entrega", name: "entrega", type: "date", required: true },
    { label: "Observações", name: "observacoes", type: "textarea" },
  ] },
  "/usuarios": { title: "Novo usuário", description: "Cadastre a pessoa e selecione o perfil e os módulos que ela poderá acessar.", fields: [
    { label: "Nome completo", name: "nome", placeholder: "Nome do colaborador", required: true },
    { label: "E-mail corporativo", name: "email", type: "email", placeholder: "nome@empresa.com.br", required: true },
    { label: "Número de registro", name: "registro", placeholder: "Ex.: REG-00042", required: true },
    { label: "Perfil de acesso", name: "perfil", type: "select", options: ["Administrador", "Gestor", "Supervisor", "Colaborador"], required: true },
    { label: "Módulos liberados", name: "modulos", type: "textarea", placeholder: "Ex.: Produção, RH & ponto, Qualidade...", required: true },
  ] },
  "/qualidade": { title: "Novo ticket de qualidade", description: "Registre uma não conformidade, inspeção pendente ou ocorrência rastreável.", fields: [
    { label: "Tipo de ocorrência", name: "tipo", type: "select", options: ["Não conformidade", "Inspeção pendente", "Reclamação", "Melhoria"], required: true },
    { label: "Lote ou ordem", name: "loteOrdem", placeholder: "Ex.: RES-2409 / OP-4821", required: true },
    { label: "Produto", name: "produto", placeholder: "Produto afetado", required: true },
    { label: "Severidade", name: "severidade", type: "select", options: ["Baixa", "Média", "Alta", "Crítica"], required: true },
    { label: "Descrição e evidências", name: "descricao", type: "textarea", placeholder: "Descreva o fato, lote, defeito e contenção imediata...", required: true },
  ] },
  "/manutencao": { title: "Novo ticket de manutenção", description: "Abra uma solicitação para máquina, molde, periférico ou ativo industrial.", fields: [
    { label: "Ativo", name: "ativo", placeholder: "Ex.: INJ-07 / Molde M-0871", required: true },
    { label: "Tipo", name: "tipo", type: "select", options: ["Corretiva", "Preventiva", "Lubrificação", "Ferramentaria"], required: true },
    { label: "Prioridade", name: "prioridade", type: "select", options: ["Programada", "Alta", "Parada imediata"], required: true },
    { label: "Descrição do problema", name: "descricao", type: "textarea", placeholder: "Sintoma, risco, ruído, desgaste ou serviço necessário...", required: true },
  ] },
  "/rh": { title: "Novo colaborador", description: "Cadastre os dados essenciais para iniciar o vínculo, jornada e acessos da pessoa.", fields: [
    { label: "Nome completo", name: "nome", placeholder: "Nome do colaborador", required: true },
    { label: "Número de registro", name: "registro", placeholder: "Ex.: REG-00042", required: true },
    { label: "Cargo", name: "cargo", placeholder: "Ex.: Operador de produção", required: true },
    { label: "Setor", name: "setor", type: "select", options: ["Produção", "Qualidade", "Manutenção", "Administrativo"], required: true },
    { label: "Jornada", name: "jornada", placeholder: "Ex.: 06:00 às 14:00", required: true },
  ] },
  "/moldes": { title: "Novo molde", description: "Cadastre o ativo de ferramentaria e mantenha cavidades e ciclos rastreáveis.", fields: [
    { label: "Código do molde", name: "codigo", placeholder: "Ex.: M-1205", required: true },
    { label: "Descrição", name: "descricao", placeholder: "Produto e aplicação", required: true },
    { label: "Cavidades", name: "cavidades", type: "number", required: true },
    { label: "Máquina compatível", name: "maquina", placeholder: "Ex.: INJ-04 · 320T", required: true },
    { label: "Observações", name: "observacoes", type: "textarea" },
  ] },
  "/materia-prima": { title: "Nova matéria-prima", description: "Registre resina, aditivo ou carga com lote, validade e rastreabilidade.", fields: [
    { label: "Material", name: "material", placeholder: "Ex.: PET PCR", required: true },
    { label: "Fornecedor", name: "fornecedor", required: true },
    { label: "Lote", name: "lote", required: true },
    { label: "Quantidade", name: "quantidade", type: "number", required: true },
    { label: "Validade", name: "validade", type: "date", required: true },
  ] },
  "/pigmentos": { title: "Novo pigmento ou masterbatch", description: "Cadastre a cor, lote e aplicação para manter o padrão entre lotes.", fields: [
    { label: "Nome da cor", name: "cor", placeholder: "Ex.: Branco W-04", required: true },
    { label: "Código do masterbatch", name: "codigo", required: true },
    { label: "Lote", name: "lote", required: true },
    { label: "Aplicação", name: "aplicacao", placeholder: "Produto ou linha", required: true },
    { label: "Observações", name: "observacoes", type: "textarea" },
  ] },
  "/financeiro": { title: "Novo lançamento financeiro", description: "Registre uma conta, recebimento ou custo vinculado à operação.", fields: [
    { label: "Tipo de lançamento", name: "tipo", type: "select", options: ["Conta a pagar", "Conta a receber", "Custo industrial", "Fluxo de caixa"], required: true },
    { label: "Descrição", name: "descricao", required: true },
    { label: "Valor", name: "valor", type: "number", required: true },
    { label: "Vencimento", name: "vencimento", type: "date", required: true },
  ] },
};

function NewActionModal({ context, actor, onClose }: { context: NavItem; actor: { name: string; record: string } | null; onClose: () => void }) {
  const definition = actionDefinitions[context.href] ?? actionDefinitions["/dashboard"];
  return <div className="modal-backdrop" role="dialog" aria-modal="true"><form className="access-modal action-modal" onSubmit={(event) => { event.preventDefault(); toast.success(`${definition.title} salvo`, { description: `Registrado por ${actor?.name ?? "usuário autenticado"} · ${actor?.record ?? "sessão ativa"}.` }); onClose(); }}><button type="button" className="modal-close" onClick={onClose}><X size={18} /></button><div className="access-modal__icon"><Plus size={21} /></div><span className="eyebrow">{context.label}</span><h2>{definition.title}</h2><p>{definition.description}</p><div className="action-fields">{definition.fields.map((field) => <label className="modal-field" key={field.name}><span>{field.label}</span>{field.type === "textarea" ? <textarea name={field.name} placeholder={field.placeholder} required={field.required} rows={3} /> : field.type === "select" ? <select name={field.name} required={field.required} defaultValue=""><option value="" disabled>Selecione...</option>{field.options?.map((option) => <option key={option}>{option}</option>)}</select> : <input name={field.name} type={field.type ?? "text"} placeholder={field.placeholder} required={field.required} />}</label>)}</div><div className="modal-hint"><ShieldCheck size={14} /> Ação registrada automaticamente para {actor?.name ?? "a sessão autenticada"}.</div><button className="button button--primary modal-submit" type="submit">Salvar {definition.title.toLowerCase()}<ChevronRight size={16} /></button><button type="button" className="modal-cancel" onClick={onClose}>Cancelar</button></form></div>;
}

function Dashboard({ onNewOrder, isLogged, userName }: { onNewOrder: (context?: NavItem) => void; isLogged: boolean; userName?: string }) {
  return <>
    <PageHeader current={navItems[0]} onNewOrder={onNewOrder} isLogged={isLogged} userName={userName} />
    <div className="metrics-grid">{metrics.map((metric) => <MetricCard key={metric.label} {...metric} />)}</div>
    <div className="dashboard-grid dashboard-grid--top"><ProductionPulse /><FactoryStatus /></div>
    <div className="dashboard-grid dashboard-grid--bottom"><OrdersPanel /><AlertsPanel /></div>
  </>;
}

function ModulePage({ current, onNewOrder, isLogged, userName }: { current: NavItem; onNewOrder: (context?: NavItem) => void; isLogged: boolean; userName?: string }) {
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

function RestrictedPage({ current, onNewOrder, onLogin }: { current: NavItem; onNewOrder: (context?: NavItem) => void; onLogin: () => void }) {
  return <><PageHeader current={current} onNewOrder={onNewOrder} isLogged={false} /><section className="restricted-panel"><div className="restricted-panel__icon"><LockKeyhole size={25} /></div><span className="eyebrow">Módulo protegido</span><h2>Acesso autorizado necessário</h2><p>O conteúdo de <b>{current.label}</b> é reservado para pessoas com permissão neste setor. Faça login para validar seu perfil e manter a rastreabilidade das consultas e ações.</p><button className="button button--primary" onClick={onLogin}><LogIn size={16} /> Entrar para acessar</button><div className="restricted-panel__note"><ShieldCheck size={15} /> Acesso público continua disponível para Dashboard, Produção, Qualidade, Estoque, Manutenção e Ordens.</div></section></>;
}

function RhPage({ onNewOrder, isLogged, userName }: { onNewOrder: (context?: NavItem) => void; isLogged: boolean; userName?: string }) {
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

function UsersAccessPage({ onNewOrder, isLogged, userName }: { onNewOrder: (context?: NavItem) => void; isLogged: boolean; userName?: string }) {
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

function ProfilePage({ onNewOrder, userName, userRecord }: { onNewOrder: (context?: NavItem) => void; userName?: string; userRecord?: string }) {
  const displayName = userName ?? "Colaborador autenticado";
  const displayRecord = userRecord ?? "REG-00000";
  return <>
    <PageHeader current={{ label: "Meu perfil", href: "/meu-perfil", icon: UserRound, restricted: true }} onNewOrder={onNewOrder} isLogged userName={displayName} />
    <div className="profile-hero panel"><div className="profile-identity"><span className="profile-avatar">{displayName.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</span><div><span className="panel-kicker">Colaborador ativo</span><h2>{displayName}</h2><p>{displayRecord} · Perfil autenticado · Unidade Wamovale</p></div></div><StatusPill label="Sessão autenticada" tone="teal" /></div>
    <div className="profile-grid"><section className="panel profile-access-panel"><div className="panel-heading"><div><span className="panel-kicker">Meu acesso</span><h2>Módulos liberados</h2></div><ShieldCheck size={18} color="var(--teal-dark)" /></div><p className="profile-intro">Estes são os módulos e ações que sua empresa liberou para você. Se precisar de outro acesso, solicite ao seu gestor.</p><div className="profile-module-list">{[["Produção", "Apontar produção e consultar ordens"], ["RH & ponto", "Registrar ponto e consultar sua jornada"], ["Qualidade", "Consultar inspeções da sua operação"]].map(([module, detail]) => <div className="profile-module" key={module}><span className="profile-module-icon"><CheckCircle2 size={14} /></span><div><b>{module}</b><small>{detail}</small></div><ChevronRight size={15} /></div>)}</div></section><section className="panel profile-score-panel"><div className="panel-heading"><div><span className="panel-kicker">Meu ciclo</span><h2>Avaliações</h2></div><Star size={18} color="#e8892d" /></div><div className="profile-score"><strong>4,6</strong><span>/ 5,0</span><div className="score-stars">★★★★★</div></div><p>Última avaliação: setembro/2026</p><button className="panel-link panel-link--button">Ver avaliações <ChevronRight size={15} /></button></section></div>
    <div className="profile-grid profile-grid--bottom"><section className="panel profile-history-panel"><div className="panel-heading"><div><span className="panel-kicker">Minha jornada</span><h2>Ponto e ocorrências</h2></div><button className="button button--secondary button--compact"><CalendarDays size={14} /> Este mês</button></div><div className="profile-kpis"><div><b>168h</b><span>trabalhadas</span></div><div><b>2</b><span>atrasos</span></div><div><b>0</b><span>faltas injustificadas</span></div></div><div className="profile-timeline"><div><span className="timeline-dot timeline-dot--teal" /><div><b>Hoje · Entrada 06:58</b><small>Registro validado pela rede local</small></div><span className="timeline-status">Regular</span></div><div><span className="timeline-dot timeline-dot--orange" /><div><b>08 out. · Atraso de 12 minutos</b><small>Justificativa aprovada pelo gestor</small></div><span className="timeline-status">Justificado</span></div><div><span className="timeline-dot timeline-dot--blue" /><div><b>02 out. · Avaliação mensal</b><small>Nota 4,6 · Operação segura</small></div><span className="timeline-status">Registrado</span></div></div><button className="panel-link panel-link--button">Ver histórico completo <History size={15} /></button></section><section className="panel profile-docs-panel"><div className="panel-heading"><div><span className="panel-kicker">Meus documentos</span><h2>Documentos e avisos</h2></div><FileText size={18} color="var(--teal-dark)" /></div><div className="profile-doc"><FileText size={15} /><div><b>Termo de ciência de ponto</b><small>Assinado em 02/01/2026</small></div><CheckCircle2 size={14} color="var(--teal-dark)" /></div><div className="profile-doc"><FileText size={15} /><div><b>Treinamento de segurança</b><small>Válido até 02/01/2027</small></div><CheckCircle2 size={14} color="var(--teal-dark)" /></div><div className="profile-note"><LockKeyhole size={14} /> Você visualiza apenas seus próprios dados.</div></section></div>
  </>;
}

function SettingsPage({ current, onNewOrder, isLogged, userName }: { current: NavItem; onNewOrder: (context?: NavItem) => void; isLogged: boolean; userName?: string }) {
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

function PublicPortal() {
  return <div className="public-portal"><header className="portal-header"><Link href="/"><img src="/tenant/wamovale-logo.jpg" alt="Wamovale" /></Link><nav><Link href="/quem-somos">Quem somos</Link><Link href="/produtos">Produtos</Link><Link href="/moldes-e-ferramentaria">Projetos e engenharia</Link><Link className="portal-career-link" href="/trabalhe-conosco">Trabalhe conosco</Link><Link className="portal-login-link" href="/erp"><LogIn size={15} /> Área do colaborador</Link></nav></header><section className="portal-human"><div className="portal-human__image"><img src="/tenant/wamovale-human-banner.png" alt="Pessoas em uma conversa sobre soluções e produtos da Wamovale" /></div><div className="portal-human__copy"><span className="portal-kicker">Gente que entende gente</span><h2>Antes de falar de peça, a gente quer entender você.</h2><p>Na Wamovale, cada projeto começa com uma conversa. Nossa equipe escuta o desafio, conhece a rotina do seu negócio e constrói o próximo passo junto com você.</p><p>Porque uma boa solução técnica também precisa caber na vida real de quem vai usar, produzir e confiar nela.</p><Link className="button button--portal" href="/contato">Conversar com a nossa equipe <ChevronRight size={15} /></Link></div></section><main className="portal-main"><div className="portal-copy"><span className="portal-kicker">Wamovale · Transformação de termoplásticos</span><h1>Ideias que ganham forma em <em>plástico.</em></h1><p>Peças injetadas, tampas, moldes, matéria-prima e pigmentação para transformar projetos em produtos de qualidade.</p><div className="portal-actions"><Link className="button button--portal" href="/cotacao"><span>Solicitar orçamento</span><ChevronRight size={16} /></Link><Link className="portal-secondary-link" href="/produtos">Conhecer produtos <ChevronRight size={16} /></Link></div></div><div className="portal-visual"><div className="portal-orbit portal-orbit--one" /><div className="portal-orbit portal-orbit--two" /><div className="portal-card portal-card--main"><span className="portal-card__label">Soluções sob medida</span><strong>Peças injetadas<br />para o seu projeto</strong><div className="portal-card__line"><span /><b>+20 anos</b><small>de experiência</small></div><div className="portal-card__line"><span /><b>6 setores</b><small>aeronáutico · automotivo · construção · alimentício · cosmético · industrial</small></div></div><div className="portal-card portal-card--float"><span>✓</span><div><b>Qualidade e inovação</b><small>Da ideia ao produto final</small></div></div></div></main><section className="portal-services"><Link className="portal-service-link" href="/injecao-plastica"><span>01</span><b>Injeção plástica <ChevronRight size={14} /></b><small>Termoplásticos para diferentes aplicações</small></Link><Link className="portal-service-link" href="/moldes-e-ferramentaria"><span>02</span><b>Projetos e engenharia <ChevronRight size={14} /></b><small>Do projeto ao molde, com apoio técnico</small></Link><Link className="portal-service-link" href="/produtos"><span>03</span><b>Tampas e embalagens <ChevronRight size={14} /></b><small>Soluções para alimentos e outros mercados</small></Link></section><section className="portal-capabilities"><div className="portal-capabilities__heading"><span className="portal-kicker">Da engenharia ao produto final</span><h2>Uma solução completa para cada projeto.</h2><p>Conhecimento técnico para escolher materiais, desenvolver moldes e entregar peças consistentes.</p></div><div className="capability-grid"><article><span><Wrench size={17} /></span><h3>Projetos, moldes e ferramentaria</h3><p>Desenvolvimento, manutenção, ajustes e usinagem para garantir precisão e repetibilidade.</p><Link href="/cotacao">Falar sobre meu molde <ChevronRight size={14} /></Link></article><article><span><Boxes size={17} /></span><h3>Matéria-prima</h3><p>Seleção de resinas termoplásticas conforme aplicação, desempenho e requisito do produto.</p><Link href="/cotacao">Orientar meu projeto <ChevronRight size={14} /></Link></article><article><span><Sparkles size={17} /></span><h3>Pigmentos e acabamento</h3><p>Padronização de cor, masterbatch e acabamento alinhados ao projeto da sua embalagem.</p><Link href="/cotacao">Consultar padrão de cor <ChevronRight size={14} /></Link></article><article><span><ShieldCheck size={17} /></span><h3>Qualidade e rastreabilidade</h3><p>Controle dimensional, inspeção e acompanhamento para entregar segurança em cada lote.</p><Link href="/cotacao">Conhecer o processo <ChevronRight size={14} /></Link></article></div></section><section className="portal-segments"><div className="portal-segments__heading"><span className="portal-kicker">Experiência que atravessa mercados</span><h2>Projetos que precisam funcionar no mundo real.</h2><p>Conhecimento em transformação de termoplásticos para diferentes desafios, volumes e aplicações.</p></div><div className="portal-segment-grid"><article><b>Aeronáutico</b><small>Precisão, leveza e controle para aplicações exigentes.</small></article><article><b>Automotivo</b><small>Componentes consistentes para ciclos e escala industrial.</small></article><article><b>Construção civil</b><small>Peças resistentes para sistemas e instalações.</small></article><article><b>Alimentício</b><small>Embalagens e fechamentos pensados para segurança e uso.</small></article><article><b>Cosmético</b><small>Acabamento, cor e apresentação que valorizam o produto.</small></article><article><b>Industrial</b><small>Soluções técnicas para projetos especiais e recorrentes.</small></article></div></section><footer className="portal-footer"><span>Transformando ideias em soluções plásticas.</span><span>São José dos Campos · SP</span></footer></div>;
}

function ErpEntryPage({ onLogin }: { onLogin: () => void }) {
  return <div className="erp-entry"><div className="erp-entry__card"><img src="/tenant/wamovale-logo.jpg" alt="Wamovale" /><span className="portal-kicker">Área interna</span><h1>Wamovale ERP</h1><p>Entre com seu e-mail corporativo e senha para acessar seus módulos, seu ponto e seus dados.</p><button className="button button--portal" onClick={onLogin}><KeyRound size={16} /> Entrar com e-mail e senha</button><div className="erp-demo-credential"><b>Acesso administrativo de demonstração</b><code>admin@wamovale.com.br</code><code>adm123</code><small>Somente para este protótipo. Trocar antes de qualquer uso real.</small></div><Link className="erp-back-link" href="/"><ArrowLeft size={15} /> Voltar ao site público</Link></div></div>;
}

const HR_EMAIL = "rh@wamovale.com.br";

const institutionalPages: Record<string, { kicker: string; title: string; intro: string; image?: string; imageAlt?: string; cards: { title: string; description: string }[] }> = {
  "/quem-somos": { kicker: "A Wamovale", image: "/tenant/wamovale-quem-somos.png", imageAlt: "Imagem conceitual sobre pessoas, parceria e construção de soluções na Wamovale", title: "Experiência industrial que entrega confiança.", intro: "Uma empresa de transformação de termoplásticos que combina conhecimento técnico, ferramentaria e proximidade para transformar necessidades em soluções.", cards: [{ title: "Conhecimento técnico", description: "Experiência em injeção plástica, desenvolvimento de produtos e processos industriais." }, { title: "Parceria de longo prazo", description: "Atendimento próximo desde a ideia inicial até a produção recorrente." }, { title: "Valorização humana", description: "Pessoas, segurança e desenvolvimento como parte da qualidade entregue." }] },
  "/produtos": { kicker: "Produtos e aplicações", image: "/tenant/official/wamovale-produtos.png", imageAlt: "Imagem institucional de embalagens e aplicações publicada no site da Wamovale", title: "Peças pensadas para o seu mercado.", intro: "Tampas, frascos, potes e componentes injetados para projetos que exigem consistência, acabamento e escala.", cards: [{ title: "Tampas e fechamentos", description: "Soluções para embalagens, incluindo tampas flip-top e aplicações técnicas." }, { title: "Frascos e potes", description: "Peças para linhas alimentícias, cosméticas, industriais e outros mercados." }, { title: "Projetos sob medida", description: "Desenvolvimento a partir de desenho, amostra física ou referência." }] },
  "/injecao-plastica": { kicker: "Transformação de termoplásticos", title: "Da matéria-prima à peça pronta.", intro: "Processos de injeção organizados para entregar repetibilidade, produtividade e acabamento compatível com cada aplicação.", cards: [{ title: "Processo controlado", description: "Parâmetros, ciclos, cavidades e inspeções acompanhados por ordem de produção." }, { title: "Escala e recorrência", description: "Estrutura para lotes piloto, produção contínua e fornecimento programado." }, { title: "Aplicações diversas", description: "Atendimento a diferentes geometrias, materiais e requisitos de uso." }] },
  "/moldes-e-ferramentaria": { kicker: "Projetos e engenharia", image: "/tenant/wamovale-engenharia.png", imageAlt: "Profissionais analisando um molde de injeção plástica na fábrica", title: "Cada projeto começa com uma conversa.", intro: "Da primeira ideia ao molde e à peça final, nossa engenharia trabalha perto de quem precisa fazer acontecer.", cards: [{ title: "Desenvolvimento de moldes", description: "Apoio técnico para transformar a geometria do produto em uma solução fabricável." }, { title: "Manutenção e ajustes", description: "Preventivas, corretivas, insertos, lubrificação e controle de ciclos." }, { title: "Usinagem e melhoria", description: "Ferramentaria próxima da produção para reduzir paradas e preservar a repetibilidade." }] },
  "/materiais-e-pigmentos": { kicker: "Materiais e acabamento", title: "A matéria-prima certa para cada aplicação.", intro: "Seleção de resinas, aditivos, masterbatch e padrões de acabamento considerando desempenho, uso e processo.", cards: [{ title: "Resinas e aditivos", description: "Avaliação de materiais conforme resistência, transparência, contato com alimentos e aplicação." }, { title: "Pigmentação e masterbatch", description: "Padronização de cor e acabamento para manter consistência entre lotes." }, { title: "Rastreabilidade", description: "Lotes, validade, consumo e aprovação acompanhados desde o recebimento." }] },
  "/qualidade-institucional": { kicker: "Qualidade", title: "Consistência em cada lote.", intro: "Qualidade não é uma etapa isolada: está presente na matéria-prima, no molde, no processo e na peça entregue.", cards: [{ title: "Inspeção dimensional", description: "Conferência de medidas e características críticas conforme o projeto." }, { title: "Controle visual", description: "Acompanhamento de acabamento, cor, rebarba, manchas e defeitos." }, { title: "Liberação e histórico", description: "Registros para apoiar decisões, rastreabilidade e melhoria contínua." }] },
  "/contato": { kicker: "Vamos conversar", title: "Seu próximo projeto começa aqui.", intro: "Envie sua necessidade comercial ou técnica. A equipe direcionará o contato para quem pode ajudar.", cards: [{ title: "Projeto novo", description: "Use o formulário de cotação para compartilhar desenho, amostra, volume e material." }, { title: "Produção recorrente", description: "Conte sobre sua demanda, frequência, volumes e requisitos de fornecimento." }, { title: "Fale com a Wamovale", description: "Retornaremos pelo canal informado para entender o melhor próximo passo." }] },
};

function InstitutionalPage({ path }: { path: string }) {
  const page = institutionalPages[path] ?? institutionalPages["/quem-somos"];
  return <div className="public-form-page"><header className="public-form-header"><Link href="/"><img src="/tenant/wamovale-logo.jpg" alt="Wamovale" /></Link><nav className="institutional-nav"><Link href="/quem-somos">Quem somos</Link><Link href="/produtos">Produtos</Link><Link href="/moldes-e-ferramentaria">Projetos e engenharia</Link><Link href="/trabalhe-conosco">Trabalhe conosco</Link><Link className="portal-login-link" href="/erp"><LogIn size={15} /> Área do colaborador</Link></nav></header><main className={`institutional-main ${page.image ? "" : "institutional-main--solo"}`}><div className="institutional-hero"><div className="institutional-intro"><span className="portal-kicker">{page.kicker}</span><h1>{page.title}</h1><p>{page.intro}</p><div className="portal-actions"><Link className="button button--portal" href="/cotacao">Solicitar orçamento <ChevronRight size={16} /></Link><Link className="portal-secondary-link" href="/contato">Falar com a equipe <ChevronRight size={16} /></Link></div></div>{page.image && <div className="institutional-visual"><img src={page.image} alt={page.imageAlt} /><span>Transformando ideias em soluções que fazem sentido.</span></div>}</div><div className="institutional-grid">{page.cards.map((card, index) => <article key={card.title}><span>0{index + 1}</span><h2>{card.title}</h2><p>{card.description}</p></article>)}</div></main><footer className="portal-footer"><Link className="portal-secondary-link" href="/"><ArrowLeft size={14} /> Voltar ao início</Link><span>Wamovale · São José dos Campos</span></footer></div>;
}
function QuotePage() {
  const [submitted, setSubmitted] = useState(false);
  return <div className="public-form-page"><header className="public-form-header"><Link href="/"><img src="/tenant/wamovale-logo.jpg" alt="Wamovale" /></Link><Link className="portal-login-link" href="/erp"><LogIn size={15} /> Área do colaborador</Link></header><main className="public-form-main"><div className="public-form-intro"><span className="portal-kicker">Injeção plástica · Desenvolvimento industrial</span><h1>Tem um projeto de peça plástica?</h1><p>Conte o que você já sabe. Nossa equipe avalia a necessidade e identifica o melhor próximo passo para fabricação.</p><div className="form-trust"><span><CheckCircle2 size={15} /> Engenharia e ferramentaria própria</span><span><CheckCircle2 size={15} /> Atendimento para projetos novos e recorrentes</span><span><CheckCircle2 size={15} /> Arquivo técnico opcional no primeiro contato</span></div></div><form className="lead-form" onSubmit={(event) => { event.preventDefault(); setSubmitted(true); toast.success("Solicitação recebida", { description: "Nossa equipe comercial entrará em contato pelo e-mail informado." }); }}><div className="lead-step"><span>1</span><div><b>O que você precisa?</b><small>Escolha a opção mais próxima do seu momento.</small></div></div><div className="choice-grid">{["Fabricar peças para meu produto", "Desenvolver uma peça nova", "Produzir com molde que já possuo", "Avaliar viabilidade ou transferir produção"].map((choice, index) => <label className="choice-card" key={choice}><input required={index === 0} type="radio" name="need" defaultChecked={index === 0} /><span>{choice}</span></label>)}</div><div className="lead-step"><span>2</span><div><b>Em que etapa está o projeto?</b><small>Isso ajuda a equipe a preparar a conversa certa.</small></div></div><div className="choice-grid choice-grid--three">{["Tenho desenho ou arquivo 3D", "Tenho uma amostra física", "Tenho apenas uma ideia ou referência"].map((choice, index) => <label className="choice-card" key={choice}><input required={index === 0} type="radio" name="stage" defaultChecked={index === 0} /><span>{choice}</span></label>)}</div><div className="lead-fields"><label><span>Empresa</span><input required placeholder="Nome da empresa" /></label><label><span>E-mail corporativo</span><input required type="email" placeholder="voce@empresa.com.br" /></label><label><span>Volume estimado</span><select defaultValue="Ainda estou avaliando"><option>Lote piloto ou pequenas quantidades</option><option>Produção recorrente em escala industrial</option><option>Ainda estou avaliando</option></select></label><label><span>Material da peça</span><select defaultValue="Preciso de orientação"><option>Já sei qual material preciso</option><option>Preciso de orientação</option></select></label></div><label className="file-drop"><input type="file" accept=".pdf,.dwg,.dxf,.step,.stp,.jpg,.png" /><Upload size={19} /><span><b>Anexar desenho, 3D ou referência <small>(opcional)</small></b><small>PDF, DWG, STEP, JPG ou PNG · até 10 MB</small></span></label><button className="button button--portal lead-submit" type="submit">{submitted ? "Solicitação enviada" : "Enviar projeto para cotação"}<ChevronRight size={16} /></button><small className="form-privacy">Seus dados serão usados apenas para retorno comercial sobre este projeto.</small></form></main><footer className="portal-footer"><Link className="portal-secondary-link" href="/"><ArrowLeft size={14} /> Voltar ao site</Link><span>Wamovale · São José dos Campos</span></footer></div>;
}

function CareersPage() {
  return <div className="public-form-page"><header className="public-form-header"><Link href="/"><img src="/tenant/wamovale-logo.jpg" alt="Wamovale" /></Link><Link className="portal-login-link" href="/erp"><LogIn size={15} /> Área do colaborador</Link></header><main className="career-main"><div className="career-copy"><span className="portal-kicker">Pessoas que fazem acontecer</span><h1>Trabalhe conosco</h1><p>Quer fazer parte da Wamovale? Envie seu currículo e conte como você pode contribuir com nossa história de inovação, qualidade e valorização humana.</p><div className="career-highlights"><span><Users size={16} /> Ambiente industrial</span><span><Sparkles size={16} /> Aprendizado e desenvolvimento</span><span><ShieldCheck size={16} /> Respeito e segurança</span></div></div><div className="career-options"><section className="career-card career-card--primary"><span className="career-card-icon"><Upload size={18} /></span><h2>Enviar currículo</h2><p>Anexe seu currículo em PDF e envie para o nosso time de Recursos Humanos.</p><label className="resume-upload"><input type="file" accept=".pdf,.doc,.docx" /><Upload size={16} /><span>Selecionar currículo</span></label><a className="button button--portal career-mailto" href={`mailto:${HR_EMAIL}?subject=Currículo%20-%20Trabalhe%20conosco%20Wamovale`}>Enviar para o RH <ChevronRight size={15} /></a></section><section className="career-card career-card--qr"><span className="career-card-icon"><QrCode size={18} /></span><h2>Enviar pelo celular</h2><p>Aponte a câmera do celular para o QR Code e envie seu currículo diretamente ao RH.</p><img className="career-qr" src="/tenant/qr-rh-wamovale.png" alt="QR Code para enviar currículo ao RH da Wamovale" /><small>Canal de RH: {HR_EMAIL}</small></section></div></main><footer className="portal-footer"><Link className="portal-secondary-link" href="/"><ArrowLeft size={14} /> Voltar ao site</Link><span>Se não houver uma vaga aberta, seu currículo fica no nosso banco de talentos.</span></footer></div>;
}

function AccessModal({ mode, isLogged, userName, onClose, onLogin, onAction }: { mode: "login" | "record"; isLogged: boolean; userName?: string; onClose: () => void; onLogin: (email: string, password: string) => void; onAction: (record: string) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [record, setRecord] = useState("");
  const isLogin = mode === "login";
  return <div className="modal-backdrop" role="dialog" aria-modal="true"><div className="access-modal"><button className="modal-close" onClick={onClose}><X size={18} /></button><div className="access-modal__icon">{isLogin ? <KeyRound size={21} /> : <ShieldCheck size={21} />}</div><span className="eyebrow">{isLogin ? "Acesso individual" : "Ação rápida rastreada"}</span><h2>{isLogin ? "Entre na sua área" : "Confirme seu registro"}</h2><p>{isLogin ? "Use seu e-mail e senha para acessar seus módulos, seu ponto, avaliações, faltas e histórico pessoal." : `O número de registro serve somente para identificar esta ação rápida. ${userName ? `Operador: ${userName}.` : ""}`}</p>{isLogin ? <><label className="modal-field"><span><Mail size={12} /> E-mail corporativo</span><input autoFocus type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="voce@empresa.com.br" /></label><label className="modal-field"><span><KeyRound size={12} /> Senha</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Sua senha" /></label><div className="modal-hint"><LockKeyhole size={14} /> O login abre somente os módulos liberados para o seu perfil.</div></> : <><label className="modal-field"><span>Número de registro funcional</span><input autoFocus value={record} onChange={(event) => setRecord(event.target.value)} placeholder="Ex.: REG-00482" /></label><div className="modal-hint"><LockKeyhole size={14} /> Este registro será salvo no histórico somente desta ação.</div></>}<button className="button button--primary modal-submit" disabled={isLogin ? !email.trim() || !password.trim() : !record.trim()} onClick={() => isLogin ? onLogin(email.trim(), password) : onAction(record.trim())}>{isLogin ? "Entrar na minha área" : "Confirmar apontamento"}<ChevronRight size={16} /></button><button className="modal-cancel" onClick={onClose}>Cancelar</button></div></div>;
}

export default function Home() {
  const [location, navigate] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [isLogged, setIsLogged] = useState(false);
  const [user, setUser] = useState<{ name: string; record: string; role: "admin" | "collaborator" } | null>(null);
  const [accessModal, setAccessModal] = useState<"login" | "record" | null>(null);
  const [actionContext, setActionContext] = useState<NavItem | null>(null);
  const [actionActor, setActionActor] = useState<{ name: string; record: string } | null>(null);
  const isErpEntry = location === "/erp";
  const current = useMemo(() => navItems.find((item) => item.href === location) ?? navItems[0], [location]);

  const handleNewOrder = (context?: NavItem) => {
    const target = context ?? navItems.find((item) => item.href === location) ?? navItems[0];
    setActionContext(target);
    if (isLogged && user) {
      setActionActor(user);
      toast.success("Ação autorizada", { description: `Registrada por ${user.name} · ${user.record}.` });
      return;
    }
    setAccessModal("record");
  };
  const handleLogin = (email: string, password: string) => { const session = authenticateDemoUser(email, password); if (!session) { toast.error(isDemoAdmin(email) ? "Senha administrativa inválida" : "Usuário ou senha inválidos", { description: "Use uma credencial demonstrativa autorizada para este protótipo." }); return; } setUser(session); setIsLogged(true); setAccessModal(null); navigate("/dashboard"); toast.success(`Sessão autenticada`, { description: session.role === "admin" ? "Administrador Wamovale · acesso total liberado." : `${session.name} · sua área pessoal foi liberada.` }); };
  const handleAction = (record: string) => { const actor = { name: user?.name ?? "Operador identificado", record }; setActionActor(actor); setUser((currentUser) => currentUser ? { ...currentUser, record } : currentUser); setAccessModal(null); toast.success("Identificação validada", { description: `Ação registrada por ${actor.name} · ${record}.` }); };
  const handleRestrictedNavigation = (item: NavItem) => { if (item.restricted && !isLogged) { toast.info("Acesso autorizado necessário", { description: `Entre para acessar ${item.label} e manter a rastreabilidade.` }); setAccessModal("login"); return; } navigate(item.href); setMobileOpen(false); };
  const handleNotification = () => toast("Você está em dia", { description: "Não há novas notificações além dos 3 alertas operacionais." });
  const handleHelp = () => toast.info("Central de ajuda", { description: "Fale com seu especialista ou abra um chamado pelo canal interno da empresa." });
  const handleProfileNavigation = () => { navigate("/meu-perfil"); setMobileOpen(false); };
  const handleSearch = (event: React.FormEvent) => { event.preventDefault(); if (search.trim()) toast.info(`Busca por “${search.trim()}”`, { description: "A busca global será conectada aos dados reais na próxima etapa." }); };

  if (location === "/") return <PublicPortal />;
  if (location === "/cotacao") return <QuotePage />;
  if (location === "/trabalhe-conosco") return <CareersPage />;
  if (institutionalPages[location]) return <InstitutionalPage path={location} />;
  const isProtectedErpRoute = navItems.some((item) => item.href === location);
  if ((isErpEntry || isProtectedErpRoute) && !isLogged) return <><ErpEntryPage onLogin={() => setAccessModal("login")} />{accessModal && <AccessModal mode={accessModal} isLogged={isLogged} userName={user?.name} onClose={() => setAccessModal(null)} onLogin={handleLogin} onAction={handleAction} />}
    {actionContext && <NewActionModal context={actionContext} actor={actionActor ?? user} onClose={() => { setActionContext(null); setActionActor(null); }} />}</>;

  return <div className="app-shell">
    <aside className={`sidebar ${mobileOpen ? "sidebar--open" : ""}`}>
      <div className="brand"><img className="tenant-logo" src="/tenant/wamovale-logo.jpg" alt="Wamovale" /><span className="brand-badge">ERP</span><button className="mobile-close" onClick={() => setMobileOpen(false)}><X size={18} /></button></div>
      <div className="workspace-switcher"><span className="workspace-avatar">WA</span><span><small>Empresa ativa</small><b>Wamovale</b></span><ChevronDown size={15} /></div>
      <nav className="sidebar-nav">{navItems.map((item) => <div key={item.href}>{item.section && <span className="nav-section">{item.section}</span>}<button className={`nav-item ${current.href === item.href ? "nav-item--active" : ""} ${item.restricted ? "nav-item--restricted" : ""}`} onClick={() => handleRestrictedNavigation(item)}><item.icon size={18} strokeWidth={current.href === item.href ? 2.4 : 1.9} /><span>{item.label}</span>{item.restricted && <LockKeyhole size={13} className="nav-lock" />}{item.label === "Qualidade" && <span className="nav-alert">3</span>}</button></div>)}</nav>
      <div className="sidebar-bottom"><button type="button" className="help-card" onClick={handleHelp}><span className="help-spark"><CircleHelp size={16} /></span><div><b>Precisa de ajuda?</b><small>Fale com seu especialista</small></div><ChevronRight size={15} /></button>{isLogged ? <button type="button" className="user-card" onClick={handleProfileNavigation}><span className="user-avatar">{user?.name.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</span><span><b>{user?.name}</b><small>Meu perfil · REG {user?.record}</small></span><MoreHorizontal size={17} /></button> : <button className="public-user-card" onClick={() => setAccessModal("login")}><span className="public-user-icon"><UserRound size={15} /></span><span><b>Acesso público</b><small>Entrar na minha área</small></span><LogIn size={15} /></button>}</div>
    </aside>
    {mobileOpen && <button className="sidebar-overlay" aria-label="Fechar menu" onClick={() => setMobileOpen(false)} />}
    <main className="main-content">
      <header className="topbar"><button className="mobile-menu" onClick={() => setMobileOpen(true)}><Menu size={20} /></button><form className="global-search" onSubmit={handleSearch}><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar ordens, lotes, produtos..." /><kbd>⌘ K</kbd></form><div className="topbar-actions"><span className={`access-mode ${isLogged ? "access-mode--logged" : ""}`}><span className="access-mode__dot" />{isLogged ? "Sessão autenticada" : "Acesso público"}</span><div className="topbar-date"><CalendarClock size={16} /><span>16 out. 2026</span><ChevronDown size={14} /></div><button className="topbar-icon" onClick={handleNotification}><span className="notification-dot" /><BellIcon /></button>{isLogged ? <div className="topbar-avatar">{user?.name.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</div> : <button className="login-button" onClick={() => setAccessModal("login")}><LogIn size={14} /> Entrar</button>}</div></header>
      <div className="page-content">{current.href === "/dashboard" ? <Dashboard onNewOrder={handleNewOrder} isLogged={isLogged} userName={user?.name} /> : current.restricted && !isLogged ? <RestrictedPage current={current} onNewOrder={handleNewOrder} onLogin={() => setAccessModal("login")} /> : current.href === "/rh" ? <RhPage onNewOrder={handleNewOrder} isLogged={isLogged} userName={user?.name} /> : current.href === "/usuarios" ? <UsersAccessPage onNewOrder={handleNewOrder} isLogged={isLogged} userName={user?.name} /> : current.href === "/meu-perfil" ? <ProfilePage onNewOrder={handleNewOrder} userName={user?.name} userRecord={user?.record} /> : current.href === "/configuracoes" ? <SettingsPage current={current} onNewOrder={handleNewOrder} isLogged={isLogged} userName={user?.name} /> : <ModulePage current={current} onNewOrder={handleNewOrder} isLogged={isLogged} userName={user?.name} />}</div>
      <footer className="app-footer"><span><span className="footer-pulse" /> Dados atualizados há 28 segundos</span><span>InjetaFlow ERP <b>v0.1 preview</b></span></footer>
    </main>
    {accessModal && <AccessModal mode={accessModal} isLogged={isLogged} userName={user?.name} onClose={() => setAccessModal(null)} onLogin={handleLogin} onAction={handleAction} />}
    {actionContext && <NewActionModal context={actionContext} actor={actionActor ?? user} onClose={() => { setActionContext(null); setActionActor(null); }} />}
  </div>;
}

function BellIcon() { return <span className="bell-icon"><span /></span>; }
