import { useEffect, useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { ChevronRight, Database, Loader2, PlugZap, Search, ShieldCheck, UserRound } from "lucide-react";
import { toast } from "sonner";
import { MODULES } from "@shared/erp/modules";
import { trpc } from "@/lib/trpc";
import { useSession } from "../session";
import { toastError } from "../api";
import { formatDateTime } from "../format";
import { ModuleCrud, PageHeader } from "../components/ModuleCrud";
import { numericError } from "@shared/erp/numbers";
import { EmptyState, NumberInput, Pagination, Spinner, useDebounced } from "../components/ui";

function EmpresaForm() {
  const { can } = useSession();
  const utils = trpc.useUtils();
  const config = trpc.config.get.useQuery();
  const update = trpc.config.update.useMutation();
  const [form, setForm] = useState({ nomeExibicao: "", unidade: "", fusoHorario: "America/Sao_Paulo", metaProducaoDiaria: "0", metaRefugoPct: "3" });
  useEffect(() => {
    if (config.data) setForm({ nomeExibicao: config.data.nomeExibicao, unidade: config.data.unidade ?? "", fusoHorario: config.data.fusoHorario, metaProducaoDiaria: String(config.data.metaProducaoDiaria), metaRefugoPct: String(config.data.metaRefugoPct) });
  }, [config.data]);
  const canEdit = can("configuracoes", "editar");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const emptyError = (key: keyof typeof form) => (!form[key].trim() && errors[key] ? <small className="erp-field-error" role="alert">{errors[key]}</small> : null);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    // N05/N10: vazio não vira 0; mensagem em português junto ao campo
    const errors: Record<string, string> = {};
    if (!form.nomeExibicao.trim()) errors.nomeExibicao = "Nome de exibição: obrigatório.";
    const metas = [["metaProducaoDiaria", { label: "Meta de produção diária (peças)", integer: true }], ["metaRefugoPct", { label: "Meta de refugo (%)", max: 100 }]] as const;
    for (const [key, rule] of metas) {
      const raw = form[key].trim();
      const message = raw ? numericError(raw, rule) : `${rule.label}: obrigatório (informe um número).`;
      if (message) errors[key] = message;
    }
    setErrors(errors);
    if (Object.keys(errors).length) {
      toast.error("Confira os campos destacados", { description: Object.values(errors).join(" ") });
      return;
    }
    try {
      await update.mutateAsync({ ...form, metaProducaoDiaria: form.metaProducaoDiaria.trim(), metaRefugoPct: form.metaRefugoPct.trim() });
      utils.config.get.invalidate();
      toast.success("Dados da empresa salvos");
    } catch (error) {
      toastError("Não foi possível salvar", error);
    }
  };
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm(c => ({ ...c, [key]: e.target.value }));
  return (
    <section className="panel module-panel" aria-label="Dados da empresa">
      <div className="panel-heading"><div><span className="panel-kicker">Empresa</span><h2>Dados da empresa ativa</h2></div></div>
      {config.isLoading ? <Spinner /> : (
        <form className="erp-form-grid erp-form-grid--4" onSubmit={submit} noValidate aria-label="Dados da empresa">
          <label className="modal-field"><span>Nome de exibição</span><input disabled={!canEdit} required value={form.nomeExibicao} onChange={set("nomeExibicao")} />{emptyError("nomeExibicao")}</label>
          <label className="modal-field"><span>Unidade</span><input disabled={!canEdit} value={form.unidade} onChange={set("unidade")} /></label>
          <label className="modal-field"><span>Fuso horário</span><select disabled={!canEdit} value={form.fusoHorario} onChange={set("fusoHorario")}><option>America/Sao_Paulo</option><option>America/Manaus</option><option>America/Recife</option></select></label>
          <label className="modal-field"><span>Meta de produção diária (peças)</span><NumberInput name="metaProducaoDiaria" label="Meta de produção diária (peças)" integer disabled={!canEdit} required value={form.metaProducaoDiaria} onChange={value => set("metaProducaoDiaria")({ target: { value } })} />{emptyError("metaProducaoDiaria")}</label>
          <label className="modal-field"><span>Meta de refugo (%)</span><NumberInput name="metaRefugoPct" label="Meta de refugo (%)" disabled={!canEdit} max={100} required value={form.metaRefugoPct} onChange={value => set("metaRefugoPct")({ target: { value } })} />{emptyError("metaRefugoPct")}</label>
          {canEdit && <div className="erp-span-4"><button className="button button--primary" disabled={update.isPending}>{update.isPending && <Loader2 size={15} className="erp-spin" />}Salvar dados da empresa</button></div>}
        </form>
      )}
    </section>
  );
}

function Auditoria() {
  const [searchInput, setSearchInput] = useState("");
  const search = useDebounced(searchInput);
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [search]);
  const list = trpc.config.auditoria.useQuery({ search: search || undefined, page, pageSize: 10 }, { placeholderData: p => p });
  return (
    <section className="panel module-panel" aria-label="Trilha de auditoria">
      <div className="panel-heading"><div><span className="panel-kicker">Rastreabilidade</span><h2>Trilha de auditoria</h2></div></div>
      <div className="erp-toolbar"><label className="erp-search"><Search size={15} /><input aria-label="Buscar na auditoria" placeholder="Buscar por ação, módulo, usuário..." value={searchInput} onChange={e => setSearchInput(e.target.value)} /></label></div>
      <div className="module-table-wrap"><table className="module-table"><thead><tr><th>Quando</th><th>Usuário</th><th>Matrícula</th><th>Ação</th><th>Módulo</th><th>Resumo</th></tr></thead><tbody>
        {list.isLoading ? <tr><td colSpan={6}><Spinner /></td></tr> : list.data!.items.length === 0 ? <tr><td colSpan={6}><EmptyState>Nenhum evento.</EmptyState></td></tr> : list.data!.items.map(item => (
          <tr key={item.id}><td>{formatDateTime(item.createdAt)}</td><td>{item.usuario}</td><td>{item.matricula ?? "—"}</td><td>{item.acao}</td><td>{item.modulo}</td><td className="muted-cell">{item.resumo}</td></tr>
        ))}
      </tbody></table></div>
      {list.data && <Pagination page={list.data.page} pages={list.data.pages} total={list.data.total} shown={list.data.items.length} onPage={setPage} />}
    </section>
  );
}

export default function ConfiguracoesPage() {
  const [, navigate] = useLocation();
  const { can } = useSession();
  const cards = [
    { title: "Dados mestres", description: "Moldes, matéria-prima, pigmentos e itens de estoque.", icon: Database, action: "Gerenciar cadastros", onClick: () => navigate(can("moldes") ? "/moldes" : "/estoque"), disabled: !can("moldes") && !can("estoque") },
    { title: "Usuários e permissões", description: "Perfis, matrícula e acesso por módulo.", icon: UserRound, action: "Ver usuários", onClick: () => navigate("/usuarios"), disabled: !can("usuarios") },
    { title: "Integrações", description: "Balanças, EDI, fiscal, IoT e e-mail. Previstas para uma próxima etapa.", icon: PlugZap, action: "Em breve", onClick: () => undefined, disabled: true },
    { title: "Regras operacionais", description: "Alertas, aprovações e rotinas do ERP.", icon: ShieldCheck, action: "Editar regras", onClick: () => document.getElementById("regras")?.scrollIntoView({ behavior: "smooth" }), disabled: false },
  ];
  return (
    <>
      <PageHeader eyebrow="Seu jeito de operar" title="Configurações" description="Dados da empresa, regras operacionais e a trilha de auditoria de todas as ações." />
      <section className="settings-grid">
        {cards.map(card => (
          <article className="settings-card" key={card.title}>
            <span className="settings-icon settings-icon--small"><card.icon size={18} /></span>
            <h2>{card.title}</h2><p>{card.description}</p>
            <button type="button" className="panel-link panel-link--button" disabled={card.disabled} title={card.disabled ? (card.action === "Em breve" ? "Em breve" : "Sem permissão") : undefined} onClick={card.onClick}>{card.action}{!card.disabled && <ChevronRight size={15} />}</button>
          </article>
        ))}
      </section>
      <EmpresaForm />
      <div id="regras"><ModuleCrud mod={MODULES.regras} embedded title="Regras operacionais" /></div>
      <Auditoria />
    </>
  );
}
