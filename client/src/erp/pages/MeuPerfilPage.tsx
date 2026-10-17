import { useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { CalendarDays, CheckCircle2, Clock3, History, KeyRound, Loader2, LogOut, Pencil, Plus, UserRound, XCircle } from "lucide-react";
import { PASSWORD_MIN_LENGTH, PASSWORD_MIN_MESSAGE, USERNAME_MAX_LENGTH, usernameError } from "@shared/erp/account";
import { toast } from "sonner";
import { PERMISSION_KEYS, PERMISSION_LABELS } from "@shared/erp/modules";
import { trpc } from "@/lib/trpc";
import { useSession } from "../session";
import { errorMessage, toastError } from "../api";
import { formatDate, formatDateTime, initials, todayInput } from "../format";
import { PageHeader } from "../components/ModuleCrud";
import { EmptyState, Modal, Spinner, StatusPill } from "../components/ui";

const TIPOS_OCORRENCIA = ["Justificativa de ausência", "Atraso", "Esquecimento de batida", "Ajuste de ponto", "Observação"] as const;
type TipoOcorrencia = (typeof TIPOS_OCORRENCIA)[number];
type OcorrenciaRow = { id: string; tipo: unknown; data: unknown; descricao: unknown; status: unknown };

/** Nova ocorrência ou edição de uma ocorrência pendente (N07). Mensagens em português junto ao campo (N10). */
function OcorrenciaModal({ onClose, editing }: { onClose: () => void; editing?: OcorrenciaRow }) {
  const utils = trpc.useUtils();
  const create = trpc.perfil.novaOcorrencia.useMutation();
  const update = trpc.perfil.editarOcorrencia.useMutation();
  const [tipo, setTipo] = useState<TipoOcorrencia>((editing?.tipo as TipoOcorrencia) ?? "Justificativa de ausência");
  const [data, setData] = useState(editing ? String(editing.data) : todayInput());
  const [descricao, setDescricao] = useState(editing ? String(editing.descricao) : "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const busy = create.isPending || update.isPending;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!data) next.data = "Data: obrigatória.";
    if (descricao.trim().length < 5) next.descricao = "Descrição: escreva pelo menos 5 caracteres.";
    setErrors(next);
    if (Object.keys(next).length) return;
    try {
      if (editing) await update.mutateAsync({ id: editing.id, tipo, data, descricao });
      else await create.mutateAsync({ tipo, data, descricao });
      utils.perfil.invalidate();
      utils.rh.invalidate();
      toast.success(editing ? "Ocorrência atualizada" : "Apontamento pessoal registrado", { description: `${tipo} · ${formatDate(data)} · aguardando análise do gestor` });
      onClose();
    } catch (error) {
      toastError(editing ? "Não foi possível salvar" : "Não foi possível registrar", error);
    }
  };
  return (
    <Modal title={editing ? "Editar ocorrência" : "Novo apontamento pessoal"} eyebrow="Meu perfil" icon={editing ? <Pencil size={20} /> : <Plus size={20} />} description="Registre uma justificativa, atraso, ajuste de ponto ou observação da sua jornada para análise do gestor." onClose={onClose}>
      <form onSubmit={submit} noValidate aria-label={editing ? "Editar ocorrência" : "Nova ocorrência"}>
        <label className="modal-field"><span>Tipo *</span><select value={tipo} onChange={e => setTipo(e.target.value as TipoOcorrencia)}>{TIPOS_OCORRENCIA.map(t => <option key={t}>{t}</option>)}</select></label>
        <label className="modal-field"><span>Data *</span><input type="date" value={data} aria-invalid={errors.data ? true : undefined} onChange={e => setData(e.target.value)} />{errors.data && <small className="erp-field-error" role="alert">{errors.data}</small>}</label>
        <label className="modal-field"><span>Descrição *</span><textarea rows={3} maxLength={2000} value={descricao} aria-invalid={errors.descricao ? true : undefined} onChange={e => setDescricao(e.target.value)} />{errors.descricao && <small className="erp-field-error" role="alert">{errors.descricao}</small>}</label>
        <div className="erp-modal-actions"><button type="button" className="button button--secondary" onClick={onClose}>Voltar</button><button className="button button--primary" disabled={busy}>{busy && <Loader2 size={15} className="erp-spin" />}{editing ? "Salvar alterações" : "Registrar"}</button></div>
      </form>
    </Modal>
  );
}

/** Minha conta: troca do nome de usuário. Matrícula, perfil e setor são só leitura (definidos pelo administrador). */
function ContaForm() {
  const { user } = useSession();
  const utils = trpc.useUtils();
  const salvar = trpc.perfil.atualizarConta.useMutation();
  const [username, setUsername] = useState(user?.username ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const problema = usernameError(username);
    setErro(problema);
    if (problema) return;
    try {
      const out = await salvar.mutateAsync({ username: username.trim().toLowerCase() });
      utils.auth.me.setData(undefined, out);
      utils.perfil.invalidate();
      toast.success("Nome de usuário atualizado", { id: "meu-perfil-conta", description: `Agora você também pode entrar com "${out.username}".` });
    } catch (error) {
      setErro(errorMessage(error));
      toast.error("Não foi possível salvar", { id: "meu-perfil-conta", description: errorMessage(error) });
    }
  };
  return (
    <section className="panel profile-docs-panel" aria-label="Minha conta">
      <div className="panel-heading"><div><span className="panel-kicker">Acesso</span><h2>Minha conta</h2></div><UserRound size={18} color="var(--teal-dark)" /></div>
      <form onSubmit={submit} noValidate aria-label="Minha conta">
        <label className="modal-field"><span>Nome de usuário (login)</span><input name="username" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={USERNAME_MAX_LENGTH} aria-invalid={erro ? true : undefined} value={username} onChange={e => { setUsername(e.target.value.toLowerCase()); setErro(null); }} />{erro && <small className="erp-field-error" role="alert">{erro}</small>}</label>
        <label className="modal-field"><span>Matrícula</span><input name="matricula" value={user?.matricula ?? ""} readOnly aria-readonly="true" disabled /><small className="erp-muted">Somente o administrador altera a matrícula.</small></label>
        <label className="modal-field"><span>E-mail</span><input name="email" value={user?.email ?? ""} readOnly disabled /></label>
        <label className="modal-field"><span>Perfil e setor</span><input name="perfil" value={`${user?.perfil ?? ""} · ${user?.setor ?? ""}`} readOnly disabled /></label>
        <div className="erp-modal-actions"><button className="button button--primary" disabled={salvar.isPending || username.trim().toLowerCase() === (user?.username ?? "")}>{salvar.isPending && <Loader2 size={15} className="erp-spin" />}Salvar nome de usuário</button></div>
      </form>
    </section>
  );
}

const SENHA_TOAST = "meu-perfil-senha";

/** Troca da própria senha: validação própria em português (sem balões nativos do navegador) e um único aviso por vez. */
function SenhaForm() {
  const change = trpc.auth.changePassword.useMutation();
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [confirma, setConfirma] = useState("");
  const [erros, setErros] = useState<{ atual?: string; nova?: string; confirma?: string }>({});
  const validar = () => {
    const out: typeof erros = {};
    if (!atual) out.atual = "Informe a senha atual.";
    if (!nova) out.nova = "Informe a nova senha.";
    else if (nova.length < PASSWORD_MIN_LENGTH) out.nova = `Nova senha: ${PASSWORD_MIN_MESSAGE}.`;
    else if (nova === atual) out.nova = "A nova senha deve ser diferente da atual.";
    if (!confirma) out.confirma = "Confirme a nova senha.";
    else if (nova && confirma !== nova) out.confirma = "As senhas não conferem.";
    return out;
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const found = validar();
    setErros(found);
    if (Object.keys(found).length) {
      toast.error("Confira os campos da senha", { id: SENHA_TOAST, description: Object.values(found)[0] });
      return;
    }
    try {
      await change.mutateAsync({ atual, nova });
      setAtual(""); setNova(""); setConfirma(""); setErros({});
      toast.success("Senha alterada", { id: SENHA_TOAST, description: "Outras sessões abertas foram encerradas." });
    } catch (error) {
      const message = errorMessage(error);
      setErros(/senha atual/i.test(message) ? { atual: message } : { nova: message });
      toast.error("Não foi possível alterar a senha", { id: SENHA_TOAST, description: message });
    }
  };
  const field = (key: keyof typeof erros) => ({
    "aria-invalid": erros[key] ? true : undefined,
    "aria-describedby": erros[key] ? `senha-erro-${key}` : undefined,
  });
  const erro = (key: keyof typeof erros) => erros[key] ? <small id={`senha-erro-${key}`} className="erp-field-error" role="alert">{erros[key]}</small> : null;
  const limpar = (key: keyof typeof erros) => setErros(current => ({ ...current, [key]: undefined }));
  return (
    <section className="panel profile-docs-panel" aria-label="Alterar senha">
      <div className="panel-heading"><div><span className="panel-kicker">Segurança</span><h2>Alterar senha</h2></div><KeyRound size={18} color="var(--teal-dark)" /></div>
      <form onSubmit={submit} noValidate aria-label="Alterar senha">
        <label className="modal-field"><span>Senha atual</span><input name="atual" type="password" autoComplete="current-password" {...field("atual")} value={atual} onChange={e => { setAtual(e.target.value); limpar("atual"); }} />{erro("atual")}</label>
        <label className="modal-field"><span>Nova senha (mín. {PASSWORD_MIN_LENGTH})</span><input name="nova" type="password" autoComplete="new-password" {...field("nova")} value={nova} onChange={e => { setNova(e.target.value); limpar("nova"); }} />{erro("nova")}</label>
        <label className="modal-field"><span>Confirmar nova senha</span><input name="confirma" type="password" autoComplete="new-password" {...field("confirma")} value={confirma} onChange={e => { setConfirma(e.target.value); limpar("confirma"); }} />{erro("confirma")}</label>
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
  const [ocorrencia, setOcorrencia] = useState(false);
  const [editando, setEditando] = useState<OcorrenciaRow | null>(null);
  const cancelar = trpc.perfil.cancelarOcorrencia.useMutation();
  const cancelarOcorrencia = async (o: OcorrenciaRow) => {
    if (!window.confirm(`Cancelar a ocorrência "${String(o.tipo)}" de ${formatDate(o.data)}?`)) return;
    try {
      await cancelar.mutateAsync({ id: o.id });
      utils.perfil.invalidate();
      utils.rh.invalidate();
      toast.success("Ocorrência cancelada");
    } catch (error) {
      toastError("Não foi possível cancelar", error);
    }
  };
  const [periodo, setPeriodo] = useState<"mes" | "tudo">("mes");
  const [completo, setCompleto] = useState(false);

  const doLogout = async () => {
    await logout();
    toast.success("Sessão encerrada");
    navigate("/erp");
  };
  const mesAtual = todayInput().slice(0, 7);
  const eventos = [
    ...(resumo.data?.batidas ?? []).map(b => ({ id: b.id, quando: String(b.dataHora), titulo: `${String(b.tipo)} · ${formatDateTime(b.dataHora)}`, detalhe: `Origem: ${String(b.origem)}${b.simulado === "sim" ? " (simulada)" : ""}${b.divergencia ? ` · ${String(b.divergencia)}` : ""}`, status: b.foraDeSequencia ? "Divergente" : "Registrado", ocorrencia: null as OcorrenciaRow | null })),
    ...(resumo.data?.ocorrencias ?? []).map(o => ({ id: o.id, quando: String(o.createdAt), titulo: `${String(o.tipo)} · ${formatDate(o.data)}`, detalhe: `${String(o.descricao)}${o.parecer ? ` — Parecer de ${String(o.analisadoPor ?? "gestor")}: ${String(o.parecer)}` : ""}`, status: String(o.status), ocorrencia: o as unknown as OcorrenciaRow })),
  ].sort((a, b) => b.quando.localeCompare(a.quando)).filter(e => periodo === "tudo" || e.quando.slice(0, 7) === mesAtual);
  const visiveis = completo ? eventos : eventos.slice(0, 6);

  return (
    <>
      <PageHeader eyebrow="Minha área" title="Meu perfil" description="Seus dados, acessos, histórico de ponto e apontamentos pessoais."
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
        {/* F0c (plano RH/Ponto v3): o ERP não registra ponto; a marcação oficial é feita no relógio (REP). */}
        <section className="panel profile-score-panel" aria-label="Meu ponto">
          <div className="panel-heading"><div><span className="panel-kicker">Meu ponto</span><h2>Marcação no relógio oficial</h2></div><Clock3 size={18} color="var(--teal-dark)" /></div>
          <p>O ponto é registrado no <b>relógio oficial (REP)</b> da empresa. O ERP não registra marcações; aqui você acompanha o seu histórico.</p>
          <p className="erp-muted">Esqueceu de bater ou precisa corrigir uma marcação? Registre uma ocorrência de ajuste para análise do RH.</p>
          <div className="erp-modal-actions"><button type="button" className="button button--secondary" onClick={() => setOcorrencia(true)}><Plus size={16} /> Registrar ocorrência de ajuste</button></div>
        </section>
      </div>
      <div className="profile-grid profile-grid--bottom">
        <section className="panel profile-history-panel" aria-label="Minha jornada">
          <div className="panel-heading"><div><span className="panel-kicker">Minha jornada</span><h2>Ponto e apontamentos</h2></div>
            <select className="select-button" aria-label="Período do histórico" value={periodo} onChange={e => setPeriodo(e.target.value as typeof periodo)}><option value="mes">Este mês</option><option value="tudo">Todo o histórico</option></select>
          </div>
          {resumo.isLoading ? <Spinner /> : visiveis.length === 0 ? <EmptyState><CalendarDays size={14} /> Nenhum registro {periodo === "mes" ? "neste mês" : "ainda"}.</EmptyState> : (
            <div className="profile-timeline">
              {visiveis.map(e => (
                <div key={e.id} data-testid="timeline-item"><span className="timeline-dot timeline-dot--teal" /><div><b>{e.titulo}</b><small>{e.detalhe}</small>
                  {e.ocorrencia && e.status === "Pendente" && <span className="timeline-actions">
                    <button type="button" className="button button--secondary button--compact" onClick={() => setEditando(e.ocorrencia)}><Pencil size={13} /> Editar</button>
                    <button type="button" className="button button--secondary button--compact" disabled={cancelar.isPending} onClick={() => cancelarOcorrencia(e.ocorrencia!)}><XCircle size={13} /> Cancelar ocorrência</button>
                  </span>}
                </div><span className="timeline-status">{e.status}</span></div>
              ))}
            </div>
          )}
          {eventos.length > 6 && <button type="button" className="panel-link panel-link--button" onClick={() => setCompleto(!completo)}>{completo ? "Mostrar menos" : `Ver histórico completo (${eventos.length})`} <History size={15} /></button>}
          <p className="erp-muted">Avaliações de desempenho ainda não fazem parte do MVP.</p>
        </section>
        <div className="profile-account-col"><ContaForm /><SenhaForm /></div>
      </div>
      {ocorrencia && <OcorrenciaModal onClose={() => setOcorrencia(false)} />}
      {editando && <OcorrenciaModal editing={editando} onClose={() => setEditando(null)} />}
    </>
  );
}
