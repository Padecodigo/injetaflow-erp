import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Download, Eye, Loader2, Pencil, Plus, RefreshCcw, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { columnLabel, type ModuleDef } from "@shared/erp/modules";
import { trpc } from "@/lib/trpc";
import { useSession } from "../session";
import { downloadFile, errorMessage, toastError } from "../api";
import { formatDateTime, formatValue } from "../format";
import { ConfirmModal, DemoBadge, EmptyState, Modal, Pagination, RowMenu, Spinner, StatusPill, useDebounced, type MenuAction } from "./ui";
import { RecordForm, invalidateModule, type RecordRow } from "./RecordForm";

export type ListFilters = { search: string; filters: Record<string, string>; dateFrom: string; dateTo: string };

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow: string; title: ReactNode; description: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-header">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions && <div className="header-actions">{actions}</div>}
    </div>
  );
}

function initialQuery(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("q") ?? "";
}

export function RecordDetails({ mod, row, onClose }: { mod: ModuleDef; row: RecordRow; onClose: () => void }) {
  return (
    <Modal wide title={`Detalhes · ${String(row[mod.autoCode?.field ?? mod.columns[0]] ?? "")}`} eyebrow={mod.label} onClose={onClose}>
      <dl className="erp-details">
        {mod.fields.map(field => (
          <div key={field.name}><dt>{field.label}</dt><dd>{formatValue(field, field.name, row[field.name])}</dd></div>
        ))}
        {"progresso" in row && <div><dt>Progresso</dt><dd>{String(row.progresso)}% ({String(row.produzido ?? 0)} peças boas)</dd></div>}
        <div><dt>Criado em</dt><dd>{formatDateTime(row.createdAt)}{row.criadoPor ? ` por ${String(row.criadoPor)}` : ""}</dd></div>
        <div><dt>Atualizado em</dt><dd>{formatDateTime(row.updatedAt)}{row.atualizadoPor ? ` por ${String(row.atualizadoPor)}` : ""}</dd></div>
        {row.demo ? <div><dt>Origem</dt><dd><DemoBadge /> dado de demonstração</dd></div> : null}
      </dl>
    </Modal>
  );
}

/**
 * Listagem + CRUD de qualquer módulo do catálogo: busca, filtros, paginação,
 * ordenação, exportação CSV, criar, ver, editar e excluir (soft delete).
 */
export function ModuleCrud({
  mod, embedded, title, extraActions, renderCell, headerActions, metrics, canCreateOverride, createLabel, onCreate, pageSize = 10,
}: {
  mod: ModuleDef;
  embedded?: boolean;
  title?: string;
  extraActions?: (row: RecordRow) => MenuAction[];
  renderCell?: (column: string, row: RecordRow) => ReactNode | undefined;
  headerActions?: ReactNode;
  metrics?: (summary: { total: number; byStatus: Record<string, number>; sum: number; sumsByType: Record<string, number> } | undefined, filters: ListFilters) => ReactNode;
  canCreateOverride?: boolean;
  createLabel?: string;
  onCreate?: () => void;
  pageSize?: number;
}) {
  const { can } = useSession();
  const utils = trpc.useUtils();
  const canEdit = can(mod.permission, "editar");
  const canCreate = (canCreateOverride ?? mod.allowCreate ?? true) && canEdit;
  const [searchInput, setSearchInput] = useState(initialQuery);
  const search = useDebounced(searchInput, 300);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<{ field: string; dir: "asc" | "desc" } | null>(null);
  const [editing, setEditing] = useState<RecordRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [viewing, setViewing] = useState<RecordRow | null>(null);
  const [deleting, setDeleting] = useState<RecordRow | null>(null);

  useEffect(() => setPage(1), [search, filters, dateFrom, dateTo]);

  const dateField = mod.fields.find(field => field.type === "date" && field.required);
  const filterFieldDefs = useMemo(
    () => [mod.statusField, ...(mod.filterFields ?? [])].filter(Boolean).map(name => mod.fields.find(field => field.name === name)!).filter(field => field?.options),
    [mod]
  );
  const query = {
    module: mod.key,
    search: search || undefined,
    filters: Object.fromEntries(Object.entries(filters).filter(([, value]) => value)),
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  };
  const list = trpc.records.list.useQuery({ ...query, page, pageSize, sortField: sort?.field, sortDir: sort?.dir }, { placeholderData: previous => previous });
  const summary = trpc.records.summary.useQuery(query, { enabled: Boolean(metrics) });
  const exportCsv = trpc.records.exportCsv.useMutation();
  const remove = trpc.records.remove.useMutation();

  const activeFilters = Object.values(filters).filter(Boolean).length + (dateFrom ? 1 : 0) + (dateTo ? 1 : 0) + (search ? 1 : 0);
  const clearFilters = () => { setSearchInput(""); setFilters({}); setDateFrom(""); setDateTo(""); };

  const doExport = async () => {
    try {
      const out = await exportCsv.mutateAsync({ ...query, sortField: sort?.field, sortDir: sort?.dir });
      downloadFile(out.filename, out.csv);
      toast.success("Exportação concluída", { description: `${out.count} registro(s) em ${out.filename}` });
    } catch (error) {
      toastError("Falha ao exportar", error);
    }
  };

  const doDelete = async () => {
    if (!deleting) return;
    try {
      await remove.mutateAsync({ module: mod.key, id: deleting.id });
      invalidateModule(utils, mod.key);
      toast.success("Registro excluído", { description: `${mod.label} · ${String(deleting[mod.autoCode?.field ?? mod.columns[0]] ?? "")}` });
      setDeleting(null);
    } catch (error) {
      toastError("Não foi possível excluir", error);
    }
  };

  const toggleSort = (column: string) => {
    if (column === "progresso") return;
    setSort(current => (current?.field === column ? (current.dir === "asc" ? { field: column, dir: "desc" } : null) : { field: column, dir: "asc" }));
  };

  const startCreate = () => (onCreate ? onCreate() : setCreating(true));
  const newButton = canCreate ? (
    <button type="button" className="button button--primary" onClick={startCreate}><Plus size={17} /> {createLabel ?? mod.createLabel}</button>
  ) : null;
  const exportButton = (
    <button type="button" className="button button--secondary" onClick={doExport} disabled={exportCsv.isPending}>
      {exportCsv.isPending ? <Loader2 size={16} className="erp-spin" /> : <Download size={16} />} Exportar CSV
    </button>
  );

  const rows = (list.data?.items ?? []) as RecordRow[];
  const rowLabel = (row: RecordRow) => String(row[mod.autoCode?.field ?? mod.columns[0]] ?? row.id);
  const actionsFor = (row: RecordRow): MenuAction[] => [
    { label: "Ver detalhes", onSelect: () => setViewing(row), icon: <Eye size={14} /> },
    ...(canEdit && mod.key !== "movimentacoes" && mod.key !== "ponto" ? [{ label: "Editar", onSelect: () => setEditing(row), icon: <Pencil size={14} /> }] : []),
    ...(extraActions?.(row) ?? []),
    ...(canEdit ? [{ label: "Excluir", onSelect: () => setDeleting(row), danger: true, icon: <Trash2 size={14} /> }] : []),
  ];

  const cell = (column: string, row: RecordRow, index: number) => {
    const custom = renderCell?.(column, row);
    if (custom !== undefined) return custom;
    const field = mod.fields.find(item => item.name === column);
    const value = row[column];
    if (column === "progresso") {
      const pct = Number(value ?? 0);
      return <div className="progress-cell"><div className="progress-track"><span style={{ width: `${Math.max(2, pct)}%`, background: pct >= 100 ? "#70951d" : "var(--teal)" }} /></div><small>{pct}%</small></div>;
    }
    if ((column === mod.statusField || column === "prioridade" || column === "severidade") && value) return <StatusPill label={String(value)} />;
    const text = formatValue(field, column, value);
    if (index === 0) return <span className="erp-primary-cell">{text}{row.demo ? <DemoBadge /> : null}</span>;
    return text;
  };

  const table = (
    <section className={`panel module-panel ${embedded ? "erp-embedded" : ""}`} aria-label={title ?? mod.label}>
      <div className="panel-heading">
        <div><span className="panel-kicker">{embedded ? mod.eyebrow : "Visão detalhada"}</span><h2>{title ?? `${mod.label} cadastrados`}</h2></div>
        {embedded && <div className="table-actions">{exportButton}{newButton}</div>}
      </div>
      <div className="erp-toolbar" role="search">
        <label className="erp-search">
          <Search size={15} />
          <input aria-label={`Buscar em ${mod.label}`} placeholder={`Buscar por ${mod.searchFields.slice(0, 3).map(name => columnLabel(mod, name).toLowerCase()).join(", ")}...`} value={searchInput} onChange={event => setSearchInput(event.target.value)} />
          {searchInput && <button type="button" aria-label="Limpar busca" onClick={() => setSearchInput("")}><X size={14} /></button>}
        </label>
        {filterFieldDefs.map(field => (
          <select key={field.name} aria-label={`Filtrar por ${field.label}`} value={filters[field.name] ?? ""} onChange={event => setFilters(current => ({ ...current, [field.name]: event.target.value }))}>
            <option value="">{field.name === mod.statusField ? `Todos os ${field.label.toLowerCase()}s` : `${field.label}: todos`}</option>
            {field.options!.map(option => <option key={option} value={option}>{option}</option>)}
          </select>
        ))}
        {dateField && (
          <span className="erp-date-range">
            <label>{dateField.label} de <input type="date" aria-label={`${dateField.label} a partir de`} value={dateFrom} onChange={event => setDateFrom(event.target.value)} /></label>
            <label>até <input type="date" aria-label={`${dateField.label} até`} value={dateTo} onChange={event => setDateTo(event.target.value)} /></label>
          </span>
        )}
        {activeFilters > 0 && <button type="button" className="button button--secondary button--compact" onClick={clearFilters}><X size={14} /> Limpar filtros ({activeFilters})</button>}
        {list.isFetching && !list.isLoading && <Spinner label="Atualizando..." />}
      </div>
      <div className="module-table-wrap">
        <table className="module-table">
          <thead>
            <tr>
              {mod.columns.map(column => (
                <th key={column} aria-sort={sort?.field === column ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}>
                  {column === "progresso" ? columnLabel(mod, column) : (
                    <button type="button" className="erp-sort" onClick={() => toggleSort(column)} title="Ordenar">
                      {columnLabel(mod, column)}
                      {sort?.field === column ? (sort.dir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : null}
                    </button>
                  )}
                </th>
              ))}
              <th><span className="sr-only">Ações</span></th>
            </tr>
          </thead>
          <tbody>
            {list.isLoading ? (
              <tr><td colSpan={mod.columns.length + 1}><Spinner /></td></tr>
            ) : list.error ? (
              <tr><td colSpan={mod.columns.length + 1}><EmptyState><b>Erro ao carregar.</b> {errorMessage(list.error)} <button type="button" className="text-button" onClick={() => list.refetch()}><RefreshCcw size={13} /> Tentar novamente</button></EmptyState></td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={mod.columns.length + 1}><EmptyState>{activeFilters ? <>Nenhum registro com esses filtros. <button type="button" className="text-button" onClick={clearFilters}>Limpar filtros</button></> : <>Nenhum registro ainda.{canCreate ? <> <button type="button" className="text-button" onClick={startCreate}>{createLabel ?? mod.createLabel}</button></> : null}</>}</EmptyState></td></tr>
            ) : (
              rows.map(row => (
                <tr key={row.id} data-testid="record-row" onDoubleClick={() => (canEdit && mod.key !== "movimentacoes" && mod.key !== "ponto" ? setEditing(row) : setViewing(row))} title="Duplo clique para abrir">
                  {mod.columns.map((column, index) => <td key={column} className={index === 0 ? "module-primary" : ""}>{cell(column, row, index)}</td>)}
                  <td><RowMenu label={rowLabel(row)} actions={actionsFor(row)} /></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {list.data && <Pagination page={list.data.page} pages={list.data.pages} total={list.data.total} shown={rows.length} onPage={setPage} />}
    </section>
  );

  return (
    <>
      {!embedded && <PageHeader eyebrow={mod.eyebrow} title={mod.label} description={mod.description} actions={<>{headerActions}{exportButton}{newButton}</>} />}
      {metrics?.(summary.data, { search, filters, dateFrom, dateTo })}
      {table}
      {creating && <RecordForm mod={mod} onClose={() => setCreating(false)} />}
      {editing && <RecordForm mod={mod} record={editing} onClose={() => setEditing(null)} />}
      {viewing && <RecordDetails mod={mod} row={viewing} onClose={() => setViewing(null)} />}
      {deleting && (
        <ConfirmModal danger title="Excluir registro?" confirmLabel="Excluir" busy={remove.isPending} onClose={() => setDeleting(null)} onConfirm={doDelete}
          message={<>O registro <b>{rowLabel(deleting)}</b> sairá das listas de {mod.label}. A exclusão é lógica: o histórico fica guardado para auditoria.</>} />
      )}
    </>
  );
}

/** Métricas padrão: total e contagem por status. */
export function StatusMetrics({ mod, summary }: { mod: ModuleDef; summary?: { total: number; byStatus: Record<string, number> } }) {
  const statusField = mod.fields.find(field => field.name === mod.statusField);
  const top = (statusField?.options ?? []).slice(0, 3);
  return (
    <div className="metrics-grid">
      <article className="metric-card"><div className="metric-card__top"><span className="metric-label">Total (filtro atual)</span></div><div className="metric-value">{summary ? summary.total : "…"}</div></article>
      {top.map(status => (
        <article className="metric-card" key={status}><div className="metric-card__top"><span className="metric-label">{status}</span></div><div className="metric-value">{summary ? summary.byStatus[status] ?? 0 : "…"}</div></article>
      ))}
    </div>
  );
}
