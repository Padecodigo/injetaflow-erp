import { useState, type FormEvent } from "react";
import { Clock3, Download, History, Loader2, MapPin, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { MODULES } from "@shared/erp/modules";
import { trpc } from "@/lib/trpc";
import { useSession } from "../session";
import { downloadFile, errorMessage, toastError } from "../api";
import { formatDate, formatDateTime, formatTime, initials, todayInput } from "../format";
import { ModuleCrud, PageHeader } from "../components/ModuleCrud";
import { RecordForm, invalidateModule, type RecordRow } from "../components/RecordForm";
import { DemoBadge, EmptyState, Metric, Modal, Spinner, StatusPill } from "../components/ui";

const TIPOS = ["Entrada", "Início de intervalo", "Fim de intervalo", "Saída"] as const;
const ORIGENS = [
  { value: "GPS", label: "GPS (simulado no MVP)" },
  { value: "Rede local", label: "Rede local (simulada no MVP)" },
  { value: "Manual", label: "Manual (lançado pelo RH)" },
] as const;

export function PontoModal({ matricula: initial, onClose }: { matricula?: string; onClose: () => void }) {
  const utils = trpc.useUtils();
  const registrar = trpc.rh.registrarPonto.useMutation();
  const [matricula, setMatricula] = useState(initial ?? "");
  const [tipo, setTipo] = useState<(typeof TIPOS)[number]>("Entrada");
  const [origem, setOrigem] = useState<(typeof ORIGENS)[number]["value"]>("Rede local");
  const [observacao, setObservacao] = useState("");
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      const out = await registrar.mutateAsync({ matricula, tipo, origem, observacao: observacao || undefined });
      utils.rh.invalidate();
      invalidateModule(utils, "ponto");
      toast.success("Ponto registrado", { description: `${String(out.nome)} · ${tipo} às ${formatTime(out.dataHora)} · ${origem}` });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      toast.error("Registro recusado", { description: errorMessage(err) });
    }
  };
  return (
    <Modal title="Registrar ponto" eyebrow="RH & ponto" icon={<Clock3 size={20} />} description="A data e a hora são as do servidor. A origem GPS/rede local ainda é simulada e fica marcada no registro." onClose={onClose}>
      <form onSubmit={submit}>
        <label className="modal-field"><span>Matrícula *</span><input required value={matricula} onChange={event => setMatricula(event.target.value)} placeholder="Ex.: MAT-0001" /></label>
        <label className="modal-field"><span>Tipo *</span><select value={tipo} onChange={event => setTipo(event.target.value as typeof tipo)}>{TIPOS.map(t => <option key={t}>{t}</option>)}</select></label>
        <label className="modal-field"><span>Origem *</span><select value={origem} onChange={event => setOrigem(event.target.value as typeof origem)}>{ORIGENS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
        <label className="modal-field"><span>Observação</span><input value={observacao} onChange={event => setObservacao(event.target.value)} /></label>
        {error && <div className="erp-form-error" role="alert">{error}</div>}
        <div className="erp-modal-actions"><button type="button" className="button button--secondary" onClick={onClose}>Cancelar</button><button className="button button--primary" disabled={registrar.isPending}>{registrar.isPending && <Loader2 size={15} className="erp-spin" />}Registrar</button></div>
      </form>
    </Modal>
  );
}

function Historico({ matricula, onClose }: { matricula: string; onClose: () => void }) {
  const h = trpc.rh.historico.useQuery({ matricula });
  return (
    <Modal wide title={`Histórico · ${matricula}`} eyebrow="RH & ponto" icon={<History size={20} />} onClose={onClose}>
      {h.isLoading ? <Spinner /> : h.error ? <p>{errorMessage(h.error)}</p> : (
        <div className="erp-history">
          {h.data!.colaborador && <p className="erp-muted"><b>{String(h.data!.colaborador.nome)}</b> · {String(h.data!.colaborador.cargo)} · {String(h.data!.colaborador.setor)} · {String(h.data!.colaborador.turno)}</p>}
          <h3>Batidas de ponto ({h.data!.batidas.length})</h3>
          {h.data!.batidas.length === 0 ? <EmptyState>Nenhuma batida registrada.</EmptyState> : (
            <table className="module-table erp-compact-table"><thead><tr><th>Data e hora</th><th>Tipo</th><th>Origem</th><th>Simulada</th></tr></thead><tbody>
              {h.data!.batidas.map(b => <tr key={b.id}><td>{formatDateTime(b.dataHora)}</td><td>{String(b.tipo)}</td><td>{String(b.origem)}</td><td>{String(b.simulado)}</td></tr>)}
            </tbody></table>
          )}
          <h3>Ocorrências ({h.data!.ocorrencias.length})</h3>
          {h.data!.ocorrencias.length === 0 ? <EmptyState>Nenhuma ocorrência.</EmptyState> : h.data!.ocorrencias.map(o => <p key={o.id} className="erp-muted">{formatDate(o.data)} · <b>{String(o.tipo)}</b> · {String(o.descricao)} <StatusPill label={String(o.status)} /></p>)}
          <h3>Apontamentos de produção ({h.data!.apontamentos.length})</h3>
          {h.data!.apontamentos.length === 0 ? <EmptyState>Nenhum apontamento.</EmptyState> : h.data!.apontamentos.map(a => <p key={a.id} className="erp-muted">{formatDateTime(a.createdAt)} · {String(a.codigo)} · {String(a.ordem)} · {String(a.quantidadeBoa)} boas / {String(a.refugo ?? 0)} refugo</p>)}
        </div>
      )}
    </Modal>
  );
}

function Relatorio({ onHistorico }: { onHistorico: (matricula: string) => void }) {
  const hoje = todayInput();
  const [inicio, setInicio] = useState(hoje.slice(0, 8) + "01");
  const [fim, setFim] = useState(hoje);
  const [matricula, setMatricula] = useState("");
  const [page, setPage] = useState(1);
  const params = { inicio, fim, matricula: matricula.trim() || undefined };
  const rel = trpc.rh.relatorio.useQuery(params, { enabled: inicio <= fim });
  const csv = trpc.rh.relatorioCsv.useMutation();
  const linhas = rel.data?.linhas.filter(l => l.situacao !== "Sem expediente") ?? [];
  const pages = Math.max(1, Math.ceil(linhas.length / 15));
  const baixar = async () => {
    try {
      const out = await csv.mutateAsync(params);
      downloadFile(out.filename, out.csv);
      toast.success("Relatório exportado", { description: `${out.count} linha(s) em ${out.filename}` });
    } catch (error) {
      toastError("Falha ao exportar", error);
    }
  };
  return (
    <section className="panel rh-report-panel" aria-label="Relatório de ponto">
      <div className="panel-heading">
        <div><span className="panel-kicker">Relatório de ponto</span><h2>Batidas, horas e ocorrências</h2></div>
        <div className="table-actions"><button type="button" className="button button--primary button--compact" onClick={baixar} disabled={csv.isPending || inicio > fim}>{csv.isPending ? <Loader2 size={14} className="erp-spin" /> : <Download size={14} />} Baixar relatório CSV</button></div>
      </div>
      <div className="erp-toolbar">
        <span className="erp-date-range"><label>De <input type="date" aria-label="Relatório de" value={inicio} onChange={e => { setInicio(e.target.value); setPage(1); }} /></label><label>até <input type="date" aria-label="Relatório até" value={fim} onChange={e => { setFim(e.target.value); setPage(1); }} /></label></span>
        <label className="erp-search"><input aria-label="Filtrar matrícula" placeholder="Matrícula (opcional)" value={matricula} onChange={e => { setMatricula(e.target.value); setPage(1); }} /></label>
        {inicio > fim && <span className="erp-alert-text">A data final deve ser posterior à inicial.</span>}
      </div>
      <div className="module-table-wrap">
        <table className="module-table rh-table"><thead><tr><th>Data</th><th>Colaborador</th><th>Entrada</th><th>Intervalo</th><th>Saída</th><th>Horas</th><th>Origem</th><th>Situação</th><th /></tr></thead><tbody>
          {rel.isLoading ? <tr><td colSpan={9}><Spinner /></td></tr> : linhas.length === 0 ? <tr><td colSpan={9}><EmptyState>Sem dados no período.</EmptyState></td></tr> : linhas.slice((page - 1) * 15, page * 15).map(l => (
            <tr key={`${l.data}-${l.matricula}`}>
              <td>{formatDate(l.data)}</td>
              <td className="module-primary">{l.nome}<small className="erp-muted"> {l.matricula}</small></td>
              <td>{formatTime(l.entrada)}</td>
              <td>{l.inicioIntervalo ? `${formatTime(l.inicioIntervalo)}–${formatTime(l.fimIntervalo)}` : "—"}</td>
              <td>{formatTime(l.saida)}</td>
              <td>{`${String(Math.floor(l.minutosTrabalhados / 60)).padStart(2, "0")}:${String(l.minutosTrabalhados % 60).padStart(2, "0")}`}</td>
              <td className="muted-cell">{l.origens || "—"}{l.simulado ? " (simulada)" : ""}</td>
              <td><StatusPill label={l.situacao} /></td>
              <td><button type="button" className="text-button" onClick={() => onHistorico(l.matricula)}>Histórico</button></td>
            </tr>
          ))}
        </tbody></table>
      </div>
      <div className="table-footer erp-table-footer"><span>{linhas.length} linha(s) · página {page} de {pages}</span><nav className="pagination"><button type="button" className="page-button" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Página anterior">‹</button><button type="button" className="page-button" disabled={page >= pages} onClick={() => setPage(page + 1)} aria-label="Próxima página">›</button></nav></div>
    </section>
  );
}

export default function RhPage() {
  const { can } = useSession();
  const canEdit = can("rh", "editar");
  const presenca = trpc.rh.presenca.useQuery(undefined, { refetchInterval: 60_000 });
  const [ponto, setPonto] = useState<{ matricula?: string } | null>(null);
  const [novo, setNovo] = useState(false);
  const [historico, setHistorico] = useState<string | null>(null);
  const [estado, setEstado] = useState<string>("");
  const [completo, setCompleto] = useState(false);
  const t = presenca.data?.totais;
  const pessoas = (presenca.data?.pessoas ?? []).filter(p => !estado || p.estado === estado);
  const visiveis = completo ? pessoas : pessoas.slice(0, 8);

  return (
    <>
      <PageHeader eyebrow="Pessoas em movimento" title="RH & ponto" description="Presença em tempo real, batidas de ponto com origem, relatório exportável e histórico por colaborador."
        actions={canEdit ? <><button type="button" className="button button--secondary" onClick={() => setPonto({})}><Clock3 size={16} /> Registrar ponto</button><button type="button" className="button button--primary" onClick={() => setNovo(true)}><UserPlus size={16} /> Novo colaborador</button></> : undefined} />
      <div className="metrics-grid rh-metrics">
        <Metric label="Presentes agora" value={t ? t.presentes : "…"} note={t ? `de ${t.escalados} escalados` : undefined} tone="teal" />
        <Metric label="Em intervalo" value={t ? t.intervalo : "…"} tone="orange" />
        <Metric label="Ausentes" value={t ? t.ausentes : "…"} note={t ? `${t.afastados} em férias/afastados` : undefined} tone="red" />
        <Metric label="Batidas hoje" value={t ? t.batidas : "…"} note={t ? Object.entries(t.origens).map(([k, v]) => `${k}: ${v}`).join(" · ") || "sem batidas" : undefined} tone="blue" />
      </div>
      <section className="panel rh-presence-panel" aria-label="Quadro de presença">
        <div className="panel-heading">
          <div><span className="panel-kicker">Hoje</span><h2>Quem está na fábrica</h2></div>
          <select aria-label="Filtrar presença" value={estado} onChange={event => setEstado(event.target.value)}>
            <option value="">Todos</option>{["Presente", "Em intervalo", "Ausente", "Saiu", "Férias", "Afastado"].map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        {presenca.isLoading ? <Spinner /> : pessoas.length === 0 ? <EmptyState>Nenhum colaborador {estado ? `com estado “${estado}”` : "cadastrado"}.{canEdit && !estado ? <> <button type="button" className="text-button" onClick={() => setNovo(true)}>Cadastrar colaborador</button></> : null}</EmptyState> : (
          <div className="presence-list">
            {visiveis.map(p => (
              <div className="presence-row" key={p.id} data-testid="presence-row">
                <span className="presence-avatar">{initials(p.nome)}</span>
                <div className="presence-person"><b>{p.nome} {p.demo ? <DemoBadge /> : null}</b><small>{p.matricula} · {p.cargo} · {p.setor}</small></div>
                <span className="presence-time" title="Entrada">{p.entrada ? formatTime(p.entrada) : "—"}</span>
                <span className="muted-cell">{p.ultimaOrigem ? <><MapPin size={11} /> {p.ultimaOrigem}</> : ""}</span>
                <StatusPill label={p.estado} />
                <button type="button" className="text-button" onClick={() => setHistorico(p.matricula)}>Histórico</button>
                {canEdit && <button type="button" className="text-button" onClick={() => setPonto({ matricula: p.matricula })}>Ponto</button>}
              </div>
            ))}
          </div>
        )}
        {pessoas.length > 8 && <button type="button" className="panel-link panel-link--button" onClick={() => setCompleto(!completo)}>{completo ? "Mostrar menos" : `Ver quadro completo (${pessoas.length})`}</button>}
      </section>
      <Relatorio onHistorico={setHistorico} />
      <ModuleCrud mod={MODULES.colaboradores} embedded title="Colaboradores" extraActions={(row: RecordRow) => [
        { label: "Histórico", onSelect: () => setHistorico(String(row.matricula)), icon: <History size={14} /> },
        ...(canEdit ? [{ label: "Registrar ponto", onSelect: () => setPonto({ matricula: String(row.matricula) }), icon: <Clock3 size={14} /> }] : []),
      ]} onCreate={() => setNovo(true)} />
      <ModuleCrud mod={MODULES.ponto} embedded title="Registros de ponto" canCreateOverride={canEdit} createLabel="Registrar ponto" onCreate={() => setPonto({})} />
      {ponto && <PontoModal matricula={ponto.matricula} onClose={() => setPonto(null)} />}
      {novo && <RecordForm mod={MODULES.colaboradores} onClose={() => setNovo(false)} />}
      {historico && <Historico matricula={historico} onClose={() => setHistorico(null)} />}
    </>
  );
}
