import { useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { CalendarDays, CheckCircle2, Clock3, History, KeyRound, Loader2, LogOut, Plus } from "lucide-react";
import { toast } from "sonner";
import { PERMISSION_KEYS, PERMISSION_LABELS } from "@shared/erp/modules";
import { trpc } from "@/lib/trpc";
import { useSession } from "../session";
import { errorMessage, toastError } from "../api";
import { formatDate, formatDateTime, initials, todayInput } from "../format";
import { PageHeader } from "../components/ModuleCrud";
import { EmptyState, Modal, Spinner, StatusPill } from "../components/ui";

const TIPOS_OCORRENCIA = ["Justificativa de ausência", "Atraso", "Esquecimento de batida", "Observação"] as const;

function OcorrenciaModal({ onClose }: { onClose: () => void }) {
  const utils = trpc.useUtils();
  const create = trpc.perfil.novaOcorrencia.useMutation();
  const [tipo, setTipo] = useState<(typeof TIPOS_OCORRENCIA)[number]>("Justificativa de ausência");
  const [data, setData] = useState(todayInput());
  const [descricao, setDescricao] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await create.mutateAsync({ tipo, data, descricao });
      utils.perfil.resumo.invalidate();
      toast.success("Apontamento pessoal registrado", { description: `${tipo} · ${formatDate(data)} · aguardando análise do gestor` });
      onClose();
    } catch (error) {
      toastError("Não foi possível registrar", error);
    }
  };
  return (
    <Modal title="Novo apontamento pessoal" eyebrow="Meu perfil" icon={<Plus size={20} />} description="Registre uma justificativa, atraso ou observação da sua jornada para análise do gestor." onClose={onClose}>
      <form onSubmit={submit}>
        <label className="modal-field"><span>Tipo *</span><select value={tipo} onChange={e => setTipo(e.target.value as typeof tipo)}>{TIPOS_OCORRENCIA.map(t => <option key={t}>{t}</option>)}</select></label>
        <label className="modal-field"><span>Data *</span><input type="date" required value={data} onChange={e => setData(e.target.value)} /></label>
        <label className="modal-field"><span>Descrição *</span><textarea required minLength={5} rows={3} value={descricao} onChange={e => setDescricao(e.target.value)} /></label>
        <div className="erp-modal-actions"><button type="button" className="button button--secondary" onClick={onClose}>Cancelar</button><button className="button button--primary" disabled={create.isPending}>{create.isPending && <Loader2 size={15} className="erp-spin" />}Registrar</button></div>
      </form>
    </Modal>
  );
}

function SenhaForm() {
  const change = trpc.auth.changePassword.useMutation();
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [confirma, setConfirma] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (nova !== confirma) {
      toast.error("As senhas não conferem");
      return;
    }
    try {
      await change.mutateAsync({ atual, nova });
      setAtual(""); setNova(""); setConfirma("");
      toast.success("Senha alterada", { description: "Outras sessões abertas foram encerradas." });
    } catch (error) {
      toast.error("Não foi possível alterar a senha", { description: errorMessage(error) });
    }
  };
  return (
    <section className="panel profile-docs-panel" aria-label="Alterar senha">
      <div className="panel-heading"><div><span className="panel-kicker">Segurança</span><h2>Alterar senha</h2></div><KeyRound size={18} color="var(--teal-dark)" /></div>
      <form onSubmit={submit}>
        <label className="modal-field"><span>Senha atual</span><input type="password" autoComplete="current-password" required value={atual} onChange={e => setAtual(e.target.value)} /></label>
        <label className="modal-field"><span>Nova senha (mín. 8)</span><input type="password" autoComplete="new-password" required minLength={8} value={nova} onChange={e => setNova(e.target.value)} /></label>
        <label className="modal-field"><span>Confirmar nova senha</span><input type="password" autoComplete="new-password" required minLength={8} value={confirma} onChange={e => setConfirma(e.target.value)} /></label>
        <div className="erp-modal-actions"><button className="button button--primary" disabled={change.isPending}>{change.isPending && <Loader2 size={15} className="erp-spin" />}Salvar nova senha</button></div>
      </form>
    </section>
  );
}

export default function MeuPerfilPage() {
  const { user, logout, can } = useSession();
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const resumo = trpc.perfil.resumo.useQuery();
  const ponto = trpc.perfil.registrarPonto.useMutation();
  const [ocorrencia, setOcorrencia] = useState(false);
  const [periodo, setPeriodo] = useState<"mes" | "tudo">("mes");
  const [completo, setCompleto] = useState(false);
  const [origem, setOrigem] = useState<"Rede local" | "GPS" | "Manual">("Rede local");

  const doLogout = async () => {
    await logout();
    toast.success("Sessão encerrada");
    navigate("/erp");
  };
  const baterPonto = async (tipo: "Entrada" | "Início de intervalo" | "Fim de intervalo" | "Saída") => {
    try {
      await ponto.mutateAsync({ tipo, origem });
      utils.perfil.resumo.invalidate();
      utils.rh.invalidate();
      toast.success("Ponto registrado", { description: `${tipo} · ${origem}${origem !== "Manual" ? " (simulado)" : ""}` });
    } catch (error) {
      toast.error("Registro recusado", { description: errorMessage(error) });
    }
  };

  const mesAtual = todayInput().slice(0, 7);
  const eventos = [
    ...(resumo.data?.batidas ?? []).map(b => ({ id: b.id, quando: String(b.dataHora), titulo: `${String(b.tipo)} · ${formatDateTime(b.dataHora)}`, detalhe: `Origem: ${String(b.origem)}${b.simulado === "sim" ? " (simulada)" : ""}`, status: "Registrado" })),
    ...(resumo.data?.ocorrencias ?? []).map(o => ({ id: o.id, quando: String(o.createdAt), titulo: `${String(o.tipo)} · ${formatDate(o.data)}`, detalhe: String(o.descricao), status: String(o.status) })),
  ].sort((a, b) => b.quando.localeCompare(a.quando)).filter(e => periodo === "tudo" || e.quando.slice(0, 7) === mesAtual);
  const visiveis = completo ? eventos : eventos.slice(0, 6);

  return (
    <>
      <PageHeader eyebrow="Minha área" title="Meu perfil" description="Seus dados, acessos, ponto e apontamentos pessoais."
        actions={<><button type="button" className="button button--secondary" onClick={doLogout}><LogOut size={16} /> Sair</button><button type="button" className="button button--primary" onClick={() => setOcorrencia(true)}><Plus size={16} /> Novo apontamento</button></>} />
      <div className="profile-hero panel">
        <div className="profile-identity"><span className="profile-avatar">{initials(user?.nome)}</span><div><span className="panel-kicker">{user?.status === "Ativo" ? "Colaborador ativo" : user?.status}</span><h2>{user?.nome}</h2><p>{user?.email} · Matrícula {user?.matricula} · {user?.setor} · {user?.perfil}</p></div></div>
        <StatusPill label="Sessão autenticada" tone="teal" />
      </div>
      <div className="profile-grid">
        <section className="panel profile-access-panel" aria-label="Meus acessos">
          <div className="panel-heading"><div><span className="panel-kicker">Meu acesso</span><h2>Módulos liberados</h2></div></div>
          <div className="profile-module-list">
            {PERMISSION_KEYS.filter(key => can(key)).map(key => (
              <div className="profile-module" key={key}><span className="profile-module-icon"><CheckCircle2 size={14} /></span><div><b>{PERMISSION_LABELS[key]}</b><small>{can(key, "editar") ? "Ver e editar" : "Somente consulta"}</small></div></div>
            ))}
            {PERMISSION_KEYS.every(key => !can(key)) && <EmptyState>Nenhum módulo liberado além do seu perfil. Peça acesso ao administrador.</EmptyState>}
          </div>
        </section>
        <section className="panel profile-score-panel" aria-label="Registrar meu ponto">
          <div className="panel-heading"><div><span className="panel-kicker">Meu ponto</span><h2>Registrar agora</h2></div><Clock3 size={18} color="var(--teal-dark)" /></div>
          <label className="modal-field"><span>Origem</span><select value={origem} onChange={e => setOrigem(e.target.value as typeof origem)}><option value="Rede local">Rede local (simulada)</option><option value="GPS">GPS (simulado)</option><option value="Manual">Manual</option></select></label>
          <div className="erp-ponto-buttons">
            {(["Entrada", "Início de intervalo", "Fim de intervalo", "Saída"] as const).map(tipo => <button type="button" key={tipo} className="button button--secondary button--compact" disabled={ponto.isPending} onClick={() => baterPonto(tipo)}>{tipo}</button>)}
          </div>
          <p className="erp-muted">Usa a sua matrícula ({user?.matricula}). A sequência é validada pelo servidor.</p>
        </section>
      </div>
      <div className="profile-grid profile-grid--bottom">
        <section className="panel profile-history-panel" aria-label="Minha jornada">
          <div className="panel-heading"><div><span className="panel-kicker">Minha jornada</span><h2>Ponto e apontamentos</h2></div>
            <select className="select-button" aria-label="Período do histórico" value={periodo} onChange={e => setPeriodo(e.target.value as typeof periodo)}><option value="mes">Este mês</option><option value="tudo">Todo o histórico</option></select>
          </div>
          {resumo.isLoading ? <Spinner /> : visiveis.length === 0 ? <EmptyState><CalendarDays size={14} /> Nenhum registro {periodo === "mes" ? "neste mês" : "ainda"}.</EmptyState> : (
            <div className="profile-timeline">
              {visiveis.map(e => <div key={e.id} data-testid="timeline-item"><span className="timeline-dot timeline-dot--teal" /><div><b>{e.titulo}</b><small>{e.detalhe}</small></div><span className="timeline-status">{e.status}</span></div>)}
            </div>
          )}
          {eventos.length > 6 && <button type="button" className="panel-link panel-link--button" onClick={() => setCompleto(!completo)}>{completo ? "Mostrar menos" : `Ver histórico completo (${eventos.length})`} <History size={15} /></button>}
          <p className="erp-muted">Avaliações de desempenho ainda não fazem parte do MVP.</p>
        </section>
        <SenhaForm />
      </div>
      {ocorrencia && <OcorrenciaModal onClose={() => setOcorrencia(false)} />}
    </>
  );
}
