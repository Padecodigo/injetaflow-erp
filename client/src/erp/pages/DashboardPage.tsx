import { useState } from "react";
import { Link } from "wouter";
import { AlertTriangle, ChevronRight, Plus } from "lucide-react";
import { MODULES } from "@shared/erp/modules";
import { trpc } from "@/lib/trpc";
import { useSession } from "../session";
import { formatDate, formatNumber, greeting, longToday } from "../format";
import { PageHeader } from "../components/ModuleCrud";
import { RecordForm } from "../components/RecordForm";
import { DemoBadge, EmptyState, Metric, Spinner, StatusPill } from "../components/ui";

const PERIODOS = [
  { value: "hoje", label: "Hoje" },
  { value: "7d", label: "Últimos 7 dias" },
  { value: "30d", label: "Últimos 30 dias" },
] as const;

export default function DashboardPage() {
  const { user, can } = useSession();
  const [periodo, setPeriodo] = useState<"hoje" | "7d" | "30d">("hoje");
  const [creating, setCreating] = useState(false);
  const summary = trpc.dashboard.summary.useQuery({ periodo }, { refetchInterval: 60_000 });
  const data = summary.data;
  const ind = data?.indicadores;
  const max = Math.max(1, ...(data?.serie.map(point => point.value) ?? [1]));
  const periodoLabel = PERIODOS.find(p => p.value === periodo)!.label.toLowerCase();

  return (
    <>
      <PageHeader
        eyebrow={longToday()}
        title={<>{greeting()}, {user?.nome.split(" ")[0]} <span className="heading-accent">↗</span></>}
        description="Indicadores calculados com os dados gravados no ERP."
        actions={can("ordens", "editar") ? <button type="button" className="button button--primary" onClick={() => setCreating(true)}><Plus size={17} /> Nova ordem</button> : undefined}
      />
      {summary.isLoading ? <Spinner /> : summary.error ? <EmptyState>Não foi possível carregar os indicadores. <button type="button" className="text-button" onClick={() => summary.refetch()}>Tentar novamente</button></EmptyState> : ind && data && (
        <>
          <div className="metrics-grid">
            <Metric label={`Produção (${periodoLabel})`} value={formatNumber(ind.producaoBoa)} note={`${ind.apontamentos} apontamento(s) · peças boas`} tone="blue" />
            <Metric label="Refugo" value={`${String(ind.refugoPct).replace(".", ",")}%`} note={`${formatNumber(ind.refugo)} peças`} tone={ind.refugoPct > 3 ? "orange" : "lime"} />
            <Metric label="Ordens ativas" value={ind.ordensAtivas} note={`${ind.ordensUrgentes} urgente(s) · ${ind.ordensAtrasadas} atrasada(s)`} tone={ind.ordensAtrasadas ? "orange" : "teal"} />
            <Metric label="Presentes agora" value={`${ind.presentes}/${ind.escalados}`} note="pelo registro de ponto" tone="teal" />
          </div>
          <div className="dashboard-grid dashboard-grid--top">
            <section className="panel panel--pulse">
              <div className="panel-heading">
                <div><span className="panel-kicker">Performance</span><h2>Ritmo de produção</h2></div>
                <select className="select-button" aria-label="Período" value={periodo} onChange={event => setPeriodo(event.target.value as typeof periodo)}>
                  {PERIODOS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              <div className="pulse-summary"><strong>{formatNumber(ind.producaoBoa)}</strong><span>peças boas · {periodoLabel}</span></div>
              {ind.producaoBoa === 0 ? <EmptyState>Nenhum apontamento no período. Registre em <Link href="/producao" className="text-button">Produção</Link>.</EmptyState> : (
                <div className="erp-bars" aria-label="Produção por período">
                  {data.serie.map(point => (
                    <div className="erp-bar" key={point.label} title={`${point.label}: ${formatNumber(point.value)} peças`}>
                      <span style={{ height: `${Math.round((point.value / max) * 100)}%` }} />
                      <small>{point.label}</small>
                    </div>
                  ))}
                </div>
              )}
            </section>
            <section className="panel panel--status">
              <div className="panel-heading"><div><span className="panel-kicker">Situação</span><h2>Pendências abertas</h2></div></div>
              <div className="line-list">
                {[
                  { label: "Qualidade em aberto", value: ind.qualidadeAbertos, href: "/qualidade", perm: "qualidade" as const },
                  { label: "OS de manutenção abertas", value: ind.manutencaoAbertas, href: "/manutencao", perm: "manutencao" as const },
                  { label: "Itens abaixo do mínimo", value: ind.estoqueBaixo, href: "/estoque", perm: "estoque" as const },
                  { label: "Lotes vencendo em 30 dias", value: ind.validadeProxima, href: "/materia-prima", perm: "materia_prima" as const },
                  { label: "Ordens abertas", value: ind.ordensAbertas, href: "/ordens", perm: "ordens" as const },
                ].map(item => (
                  <div className="line-row" key={item.label}>
                    <div className="line-row__name"><div><b>{item.label}</b></div></div>
                    <strong>{item.value}</strong>
                    {can(item.perm) ? <Link className="text-button" href={item.href}>Abrir <ChevronRight size={13} /></Link> : <span className="muted-cell">sem acesso</span>}
                  </div>
                ))}
              </div>
            </section>
          </div>
          <div className="dashboard-grid dashboard-grid--bottom">
            <section className="panel panel--orders">
              <div className="panel-heading"><div><span className="panel-kicker">Fila</span><h2>Ordens em andamento</h2></div>{can("ordens") && <Link href="/ordens" className="text-button">Ver todas <ChevronRight size={15} /></Link>}</div>
              {data.ordens.length === 0 ? <EmptyState>Nenhuma ordem ativa.</EmptyState> : (
                <div className="orders-table-wrap"><table className="orders-table"><thead><tr><th>Ordem</th><th>Produto / máquina</th><th>Progresso</th><th>Status</th><th>Entrega</th></tr></thead><tbody>
                  {data.ordens.map(ordem => (
                    <tr key={ordem.id}>
                      <td><b className="order-id">{String(ordem.codigo)}</b>{ordem.demo ? <DemoBadge /> : null}</td>
                      <td><div className="product-cell"><b>{String(ordem.produto)}</b><span>{String(ordem.maquina)} · {String(ordem.molde)}</span></div></td>
                      <td><div className="progress-cell"><div className="progress-track"><span style={{ width: `${Math.max(2, Number(ordem.progresso))}%`, background: "var(--teal)" }} /></div><small>{String(ordem.progresso)}%</small></div></td>
                      <td><StatusPill label={String(ordem.status)} /></td>
                      <td className="muted-cell">{formatDate(ordem.entrega)}</td>
                    </tr>
                  ))}
                </tbody></table></div>
              )}
            </section>
            <section className="panel panel--alerts">
              <div className="panel-heading"><div><span className="panel-kicker">Atenção</span><h2>Alertas</h2></div><span className="alert-count">{data.alertas.length} ativo(s)</span></div>
              {data.alertas.length === 0 ? <EmptyState>Nenhum alerta. Tudo em dia.</EmptyState> : (
                <div className="alert-list">
                  {data.alertas.map(alert => (
                    <Link className="alert-row" key={alert.titulo} href={alert.href}>
                      <span className="alert-icon"><AlertTriangle size={16} /></span>
                      <div className="alert-copy"><b>{alert.titulo}</b><span>{alert.detalhe}</span></div>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </div>
        </>
      )}
      {creating && <RecordForm mod={MODULES.ordens} onClose={() => setCreating(false)} />}
    </>
  );
}
