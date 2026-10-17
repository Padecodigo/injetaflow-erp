import { useState, type FormEvent } from "react";
import { ArrowLeftRight, CheckCircle2, ClipboardPlus, Download, History, Loader2, PlayCircle, ShieldAlert, ShieldCheck, Wrench } from "lucide-react";
import { toast } from "sonner";
import { MODULES, type ModuleDef } from "@shared/erp/modules";
import { trpc } from "@/lib/trpc";
import { useSession } from "../session";
import { errorMessage, toastError } from "../api";
import { formatDate, formatDateTime, formatMoney, formatNumber, todayInput } from "../format";
import { ModuleCrud, PageHeader, StatusMetrics } from "../components/ModuleCrud";
import { RecordForm, invalidateModule, type RecordRow } from "../components/RecordForm";
import { EmptyState, Metric, Modal, NumberInput, Spinner, StatusPill, type MenuAction } from "../components/ui";

function useQuickUpdate(mod: ModuleDef) {
  const utils = trpc.useUtils();
  const update = trpc.records.update.useMutation();
  return async (row: RecordRow, patch: Record<string, unknown>, label: string) => {
    try {
      await update.mutateAsync({ module: mod.key, id: row.id, data: patch });
      invalidateModule(utils, mod.key);
      toast.success(label, { description: `${mod.label} · ${String(row[mod.autoCode?.field ?? mod.columns[0]] ?? "")}` });
    } catch (error) {
      toastError("Não foi possível atualizar", error);
    }
  };
}

export function OrdensPage() {
  const { can } = useSession();
  const [apontar, setApontar] = useState<RecordRow | null>(null);
  const quick = useQuickUpdate(MODULES.ordens);
  const canEdit = can("ordens", "editar");
  return (
    <>
      <ModuleCrud
        mod={MODULES.ordens}
        metrics={summary => <StatusMetrics mod={MODULES.ordens} summary={summary} />}
        extraActions={row => [
          ...(can("producao", "editar") && !["Concluída", "Cancelada"].includes(String(row.status)) ? [{ label: "Registrar apontamento", onSelect: () => setApontar(row), icon: <ClipboardPlus size={14} /> }] : []),
          ...(canEdit && row.status !== "Concluída" ? [{ label: "Marcar como concluída", onSelect: () => quick(row, { status: "Concluída" }, "Ordem concluída"), icon: <CheckCircle2 size={14} /> }] : []),
        ]}
      />
      {apontar && <RecordForm mod={MODULES.producao} defaults={{ ordem: String(apontar.codigo) }} onClose={() => setApontar(null)} />}
    </>
  );
}

/** Apontamento rápido no chão de fábrica: o operador se identifica só pela matrícula. */
function QuickApontamento() {
  const utils = trpc.useUtils();
  const ordens = trpc.records.options.useQuery({ module: "ordens", field: "codigo", labelField: "produto" });
  const create = trpc.records.create.useMutation();
  const empty = { ordem: "", matricula: "", quantidadeBoa: "", refugo: "0", turno: "1º turno" };
  const [form, setForm] = useState(empty);
  const [error, setError] = useState<string | null>(null);
  const abertas = (ordens.data ?? []).filter(option => !["Concluída", "Cancelada"].includes(option.status));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      const saved = await create.mutateAsync({ module: "producao", data: form });
      invalidateModule(utils, "producao");
      toast.dismiss();
      toast.success("Apontamento registrado", { description: `${String(saved.codigo)} · ${String(saved.operador)} · ${formatNumber(saved.quantidadeBoa)} peças boas` });
      setForm({ ...empty, ordem: form.ordem, turno: form.turno });
    } catch (err) {
      setError(errorMessage(err));
      toast.error("Apontamento recusado", { description: errorMessage(err) });
    }
  };
  const set = (key: keyof typeof empty) => (event: { target: { value: string } }) => setForm(current => ({ ...current, [key]: event.target.value }));
  return (
    <section className="panel module-panel erp-quick" aria-label="Apontamento rápido">
      <div className="panel-heading"><div><span className="panel-kicker">Chão de fábrica</span><h2>Apontamento rápido por matrícula</h2></div></div>
      <p className="erp-muted">A matrícula identifica o operador nesta ação e é diferente do login de quem está com a sessão aberta.</p>
      <form className="erp-quick__form" onSubmit={submit}>
        <label className="modal-field"><span>Ordem *</span>
          <select required value={form.ordem} onChange={set("ordem")} aria-label="Ordem de produção">
            <option value="">{ordens.isLoading ? "Carregando..." : abertas.length ? "Selecione..." : "Nenhuma ordem aberta"}</option>
            {abertas.map(option => <option key={option.value} value={option.value}>{option.value} · {option.label} ({option.status})</option>)}
          </select>
        </label>
        <label className="modal-field"><span>Matrícula do operador *</span><input required value={form.matricula} onChange={set("matricula")} placeholder="Ex.: MAT-0001" aria-label="Matrícula do operador" /></label>
        <label className="modal-field"><span>Peças boas *</span><NumberInput required integer value={form.quantidadeBoa} onChange={value => set("quantidadeBoa")({ target: { value } })} aria-label="Peças boas" /></label>
        <label className="modal-field"><span>Refugo</span><NumberInput integer value={form.refugo} onChange={value => set("refugo")({ target: { value } })} aria-label="Refugo" /></label>
        <label className="modal-field"><span>Turno *</span><select value={form.turno} onChange={set("turno")} aria-label="Turno">{MODULES.producao.fields.find(f => f.name === "turno")!.options!.map(o => <option key={o}>{o}</option>)}</select></label>
        <button className="button button--primary" type="submit" disabled={create.isPending}>{create.isPending ? <Loader2 size={15} className="erp-spin" /> : <ClipboardPlus size={15} />} Apontar</button>
      </form>
      {error && <div className="erp-form-error" role="alert">{error}</div>}
    </section>
  );
}

export function ProducaoPage() {
  const { can } = useSession();
  return (
    <>
      <PageHeader eyebrow="Centro de comando" title="Produção" description="Aponte a produção por ordem e acompanhe o progresso calculado a partir dos apontamentos." />
      {can("producao", "editar") && <QuickApontamento />}
      {can("ordens") && <ModuleCrud mod={MODULES.ordens} embedded title="Ordens de produção" pageSize={5} />}
      <ModuleCrud mod={MODULES.producao} embedded title="Apontamentos registrados" />
    </>
  );
}

export function QualidadePage() {
  const quick = useQuickUpdate(MODULES.qualidade);
  const { can } = useSession();
  const canEdit = can("qualidade", "editar");
  return (
    <ModuleCrud
      mod={MODULES.qualidade}
      metrics={summary => <StatusMetrics mod={MODULES.qualidade} summary={summary} />}
      extraActions={row => canEdit ? [
        ...(row.status !== "Liberado" ? [{ label: "Liberar", onSelect: () => quick(row, { status: "Liberado" }, "Registro liberado"), icon: <ShieldCheck size={14} /> }] : []),
        ...(row.status !== "Quarentena" ? [{ label: "Colocar em quarentena", onSelect: () => quick(row, { status: "Quarentena" }, "Em quarentena"), icon: <ShieldAlert size={14} /> }] : []),
      ] : []}
    />
  );
}

export function EstoquePage() {
  const { can } = useSession();
  const [moving, setMoving] = useState<{ item?: string } | null>(null);
  const canEdit = can("estoque", "editar");
  return (
    <>
      <ModuleCrud
        mod={MODULES.estoque}
        headerActions={canEdit ? <button type="button" className="button button--secondary" onClick={() => setMoving({})}><ArrowLeftRight size={16} /> Nova movimentação</button> : undefined}
        metrics={summary => <StatusMetrics mod={MODULES.estoque} summary={summary} />}
        renderCell={(column, row) => column === "saldo" ? <span className={Number(row.estoqueMinimo ?? 0) > 0 && Number(row.saldo) < Number(row.estoqueMinimo) ? "erp-alert-text" : ""}>{formatNumber(row.saldo)} {String(row.unidade ?? "")}</span> : undefined}
        extraActions={row => canEdit ? [{ label: "Movimentar (entrada/saída)", onSelect: () => setMoving({ item: String(row.codigo) }), icon: <ArrowLeftRight size={14} /> }] : []}
      />
      <ModuleCrud mod={MODULES.movimentacoes} embedded title="Histórico de movimentações" canCreateOverride={canEdit} createLabel="Nova movimentação" onCreate={() => setMoving({})} />
      {moving && <RecordForm mod={MODULES.movimentacoes} title="Movimentar estoque" defaults={moving.item ? { item: moving.item } : undefined} onClose={() => setMoving(null)} />}
    </>
  );
}

function MoldHistory({ codigo, onClose }: { codigo: string; onClose: () => void }) {
  const list = trpc.records.list.useQuery({ module: "manutencao", search: codigo, pageSize: 50 });
  return (
    <Modal wide title={`Histórico de manutenção · ${codigo}`} eyebrow="Moldes & ferramentaria" icon={<History size={20} />} onClose={onClose}>
      {list.isLoading ? <Spinner /> : list.error ? <p>{errorMessage(list.error)}</p> : list.data!.items.length === 0 ? <EmptyState>Nenhuma OS de manutenção vinculada a este molde.</EmptyState> : (
        <table className="module-table erp-compact-table"><thead><tr><th>OS</th><th>Tipo</th><th>Status</th><th>Previsão</th><th>Aberta em</th></tr></thead><tbody>
          {list.data!.items.map(item => <tr key={item.id}><td>{String(item.codigo)}</td><td>{String(item.tipo)}</td><td><StatusPill label={String(item.status)} /></td><td>{formatDate(item.previsao)}</td><td>{formatDateTime(item.createdAt)}</td></tr>)}
        </tbody></table>
      )}
    </Modal>
  );
}

export function MoldesPage() {
  const { can } = useSession();
  const [history, setHistory] = useState<string | null>(null);
  const [os, setOs] = useState<string | null>(null);
  return (
    <>
      <ModuleCrud
        mod={MODULES.moldes}
        metrics={summary => <StatusMetrics mod={MODULES.moldes} summary={summary} />}
        extraActions={row => [
          ...(can("manutencao") ? [{ label: "Histórico de manutenção", onSelect: () => setHistory(String(row.codigo)), icon: <History size={14} /> }] : []),
          ...(can("manutencao", "editar") ? [{ label: "Abrir OS de manutenção", onSelect: () => setOs(String(row.codigo)), icon: <Wrench size={14} /> }] : []),
        ]}
      />
      {history && <MoldHistory codigo={history} onClose={() => setHistory(null)} />}
      {os && <RecordForm mod={MODULES.manutencao} defaults={{ ativo: os, tipo: "Ferramentaria" }} onClose={() => setOs(null)} />}
    </>
  );
}

function daysUntil(date: string): number {
  const target = new Date(`${date}T12:00:00`).getTime();
  const today = new Date(`${todayInput()}T12:00:00`).getTime();
  return Math.round((target - today) / 86400000);
}

function ConsumoModal({ row, onClose }: { row: RecordRow; onClose: () => void }) {
  const utils = trpc.useUtils();
  const consume = trpc.records.consumirMateriaPrima.useMutation();
  const [quantidade, setQuantidade] = useState("");
  const [documento, setDocumento] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const out = await consume.mutateAsync({ id: row.id, quantidade: Number(quantidade), documento: documento || undefined });
      invalidateModule(utils, "materia_prima");
      toast.success("Saída registrada", { description: `Lote ${String(row.lote)} · saldo ${formatNumber(out.quantidade)} kg` });
      onClose();
    } catch (error) {
      toastError("Saída recusada", error);
    }
  };
  return (
    <Modal title={`Saída do lote ${String(row.lote)}`} eyebrow="Matéria-prima" description={`Saldo atual: ${formatNumber(row.quantidade)} kg. A saída baixa o saldo do lote.`} onClose={onClose}>
      <form onSubmit={submit}>
        <label className="modal-field"><span>Quantidade (kg) *</span><NumberInput min={0.001} required value={quantidade} onChange={setQuantidade} /></label>
        <label className="modal-field"><span>Documento / ordem</span><input value={documento} onChange={event => setDocumento(event.target.value)} placeholder="Ex.: OP-0001" /></label>
        <div className="erp-modal-actions"><button type="button" className="button button--secondary" onClick={onClose}>Cancelar</button><button className="button button--primary" disabled={consume.isPending}>{consume.isPending && <Loader2 size={15} className="erp-spin" />}Registrar saída</button></div>
      </form>
    </Modal>
  );
}

export function MateriaPrimaPage() {
  const { can } = useSession();
  const [consumo, setConsumo] = useState<RecordRow | null>(null);
  return (
    <>
      <ModuleCrud
        mod={MODULES.materia_prima}
        metrics={summary => <StatusMetrics mod={MODULES.materia_prima} summary={summary} />}
        renderCell={(column, row) => {
          if (column !== "validade" || !row.validade) return undefined;
          const days = daysUntil(String(row.validade));
          return <span className={days <= 30 ? "erp-alert-text" : ""}>{formatDate(row.validade)}{days < 0 ? " · vencido" : days <= 30 ? ` · vence em ${days} dia(s)` : ""}</span>;
        }}
        extraActions={row => can("materia_prima", "editar") ? [{ label: "Registrar saída (consumo)", onSelect: () => setConsumo(row), icon: <ArrowLeftRight size={14} /> }] : []}
      />
      {consumo && <ConsumoModal row={consumo} onClose={() => setConsumo(null)} />}
    </>
  );
}

export function PigmentosPage() {
  return <ModuleCrud mod={MODULES.pigmentos} metrics={summary => <StatusMetrics mod={MODULES.pigmentos} summary={summary} />} />;
}

export function ManutencaoPage() {
  const quick = useQuickUpdate(MODULES.manutencao);
  const { can } = useSession();
  return (
    <ModuleCrud
      mod={MODULES.manutencao}
      metrics={summary => <StatusMetrics mod={MODULES.manutencao} summary={summary} />}
      extraActions={row => can("manutencao", "editar") ? [
        ...(row.status === "Aberta" || row.status === "Aguardando peça" ? [{ label: "Iniciar execução", onSelect: () => quick(row, { status: "Em execução" }, "OS em execução"), icon: <PlayCircle size={14} /> }] : []),
        ...(row.status !== "Concluída" && row.status !== "Cancelada" ? [{ label: "Concluir OS", onSelect: () => quick(row, { status: "Concluída" }, "OS concluída"), icon: <CheckCircle2 size={14} /> }] : []),
      ] as MenuAction[] : []}
    />
  );
}

export function FinanceiroPage() {
  return (
    <ModuleCrud
      mod={MODULES.financeiro}
      metrics={summary => (
        <div className="metrics-grid">
          <Metric label="A receber (filtro)" value={summary ? formatMoney((summary.sumsByType["Conta a receber"] ?? 0) + (summary.sumsByType["Receita"] ?? 0)) : "…"} note="contas a receber + receitas" tone="teal" />
          <Metric label="A pagar (filtro)" value={summary ? formatMoney(summary.sumsByType["Conta a pagar"] ?? 0) : "…"} note="contas a pagar" tone="orange" />
          <Metric label="Custos industriais" value={summary ? formatMoney(summary.sumsByType["Custo industrial"] ?? 0) : "…"} tone="blue" />
          <Metric label="Lançamentos" value={summary ? summary.total : "…"} note={summary ? `${summary.byStatus["Em aberto"] ?? 0} em aberto · ${summary.byStatus["Atrasado"] ?? 0} atrasado(s)` : undefined} tone="lime" />
        </div>
      )}
    />
  );
}

export function SolicitacoesPage() {
  const quick = useQuickUpdate(MODULES.solicitacoes);
  const { can } = useSession();
  return (
    <ModuleCrud
      mod={MODULES.solicitacoes}
      metrics={summary => <StatusMetrics mod={MODULES.solicitacoes} summary={summary} />}
      renderCell={(column, row) => column === "anexo" ? (row.anexo ? <a className="text-button" href={`/api/anexos/${row.id}`} onClick={event => event.stopPropagation()}><Download size={13} /> {String(row.anexo)}</a> : "—") : undefined}
      extraActions={row => can("solicitacoes", "editar") ? [
        ...(row.status === "Novo" ? [{ label: "Marcar em atendimento", onSelect: () => quick(row, { status: "Em atendimento" }, "Solicitação em atendimento") }] : []),
        ...(row.status !== "Respondido" ? [{ label: "Marcar como respondida", onSelect: () => quick(row, { status: "Respondido" }, "Solicitação respondida") }] : []),
      ] : []}
    />
  );
}
