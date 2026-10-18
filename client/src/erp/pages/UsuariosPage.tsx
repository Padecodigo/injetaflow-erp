import { useEffect, useState, type FormEvent } from "react";
import { Download, Eye, EyeOff, KeyRound, Loader2, Pencil, Search, Trash2, UserCheck, UserPlus, UserX, X } from "lucide-react";
import { toast } from "sonner";
import { PERFIL_PRESETS, PERFIS, PERMISSION_KEYS, PERMISSION_LABELS, SETORES, permissionsBeyond, type Perfil, type Permissions } from "@shared/erp/modules";
import { PASSWORD_MIN_LENGTH, USERNAME_MAX_LENGTH, USERNAME_MIN_LENGTH } from "@shared/erp/account";
import { trpc } from "@/lib/trpc";
import { useSession, type SessionUser } from "../session";
import { downloadFile, errorMessage, toastError } from "../api";
import { formatDateTime, initials } from "../format";
import { PageHeader } from "../components/ModuleCrud";
import { ConfirmModal, DemoBadge, EmptyState, Modal, Pagination, RowMenu, Spinner, StatusPill, useDebounced } from "../components/ui";

type UserRow = SessionUser & { createdAt?: string; demo?: boolean };

const USUARIOS_TOAST = "usuarios-acao";

/** R-01: módulos do alvo além dos de quem está logado (vazio para o admin ou para a própria linha). */
function alemDoMeu(me: SessionUser | null | undefined, row: UserRow) {
  if (!me || row.id === me.id) return [];
  return permissionsBeyond(me, row);
}

function randomPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(14));
  return Array.from(bytes, b => alphabet[b % alphabet.length]).join("");
}

function UserForm({ user, onClose }: { user?: UserRow | null; onClose: () => void }) {
  const utils = trpc.useUtils();
  const create = trpc.usuarios.create.useMutation();
  const update = trpc.usuarios.update.useMutation();
  const editing = Boolean(user);
  const { user: me, can } = useSession();
  const meIsAdmin = me?.perfil === "Administrador";
  // só o administrador altera matrícula (o servidor também bloqueia)
  const canEditMatricula = !editing || meIsAdmin;
  // P6-01: ninguém altera o próprio perfil, módulos ou status (o servidor também bloqueia)
  const self = editing && user!.id === me?.id;
  const original = user?.permissoes ?? {};
  /** Quem não é administrador só concede módulos que possui (no mesmo nível); o que a pessoa já tinha continua. */
  const canGrant = (key: (typeof PERMISSION_KEYS)[number], level: "ver" | "editar") => {
    if (meIsAdmin) return true;
    const before = original[key];
    if (before === "editar" || before === level) return true;
    return can(key, level);
  };
  const clip = (perms: Permissions): Permissions => {
    const out: Permissions = {};
    for (const key of PERMISSION_KEYS) {
      const level = perms[key];
      if (!level) continue;
      if (canGrant(key, level)) out[key] = level;
      else if (level === "editar" && canGrant(key, "ver")) out[key] = "ver";
    }
    return out;
  };
  // R-01: credenciais e status de quem tem mais acesso que eu ficam com o administrador
  const excesso = editing ? alemDoMeu(me, user!) : [];
  const credTravadas = excesso.length > 0;
  const perfisDisponiveis = PERFIS.filter(p => meIsAdmin || p !== "Administrador");
  const [username, setUsername] = useState(user?.username ?? "");
  const [nome, setNome] = useState(user?.nome ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [matricula, setMatricula] = useState(user?.matricula ?? "");
  const [setor, setSetor] = useState<string>(user?.setor ?? "Produção");
  const [perfil, setPerfil] = useState<Perfil>((user?.perfil as Perfil) ?? "Operador");
  const [status, setStatus] = useState<"Ativo" | "Inativo">(user?.status ?? "Ativo");
  const [senha, setSenha] = useState("");
  // F-18 (auditoria de frontend): senha oculta por padrão (quem olha por cima do ombro não vê); "Mostrar" sob demanda
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [permissoes, setPermissoes] = useState<Permissions>(() => user?.permissoes ?? clip(PERFIL_PRESETS.Operador));
  const [error, setError] = useState<string | null>(null);
  const busy = create.isPending || update.isPending;
  const isAdmin = perfil === "Administrador";

  const choosePerfil = (value: Perfil) => {
    setPerfil(value);
    setPermissoes(clip({ ...PERFIL_PRESETS[value] }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      if (editing) {
        await update.mutateAsync({ id: user!.id, data: { nome, ...(credTravadas ? {} : { email, ...(username.trim() ? { username: username.trim() } : {}) }), ...(canEditMatricula ? { matricula } : {}), setor: setor as (typeof SETORES)[number], ...(self ? {} : { perfil, permissoes }), ...(self || credTravadas ? {} : { status }), novaSenha: credTravadas ? undefined : senha || undefined } });
      } else {
        await create.mutateAsync({ nome, email, username: username.trim() || undefined, matricula, setor: setor as (typeof SETORES)[number], perfil, status, permissoes, senha });
      }
      utils.usuarios.list.invalidate();
      toast.dismiss();
      toast.success(editing ? "Usuário atualizado" : "Usuário cadastrado", { id: USUARIOS_TOAST, description: editing ? nome : `${nome} já pode entrar com ${username.trim() || email}${senha ? " e a senha inicial informada" : ""}.` });
      onClose();
    } catch (err) {
      // F-01: o erro fica no modal (role=alert, junto aos botões); sem toast cobrindo "Cadastrar usuário"
      setError(`Não foi possível salvar: ${errorMessage(err)}`);
    }
  };

  const selected = PERMISSION_KEYS.filter(key => isAdmin || permissoes[key]);

  return (
    <Modal wide title={editing ? `Editar ${user!.nome}` : "Novo usuário"} eyebrow="Usuários e acessos" icon={<UserPlus size={20} />} description="Defina setor, perfil, matrícula e exatamente quais módulos a pessoa pode ver ou editar." onClose={onClose}>
      <form onSubmit={submit} aria-label={editing ? "Editar usuário" : "Novo usuário"}>
        {credTravadas && <div className="erp-form-note" role="note" data-testid="credenciais-travadas">Esta pessoa tem acesso além do seu ({excesso.map(key => PERMISSION_LABELS[key]).join(", ")}). Senha, e-mail, nome de usuário e status só podem ser alterados pelo administrador.</div>}
        <div className="erp-form-grid">
          <label className="modal-field"><span>Nome completo *</span><input name="nome" required minLength={3} value={nome} onChange={e => setNome(e.target.value)} /></label>
          <label className="modal-field"><span>E-mail corporativo *</span><input name="email" type="email" required disabled={credTravadas} value={email} onChange={e => setEmail(e.target.value)} /></label>
          <label className="modal-field"><span>Nome de usuário {editing ? "*" : "(opcional)"}</span><input name="username" disabled={credTravadas} autoCapitalize="none" autoCorrect="off" spellCheck={false} required={editing} minLength={USERNAME_MIN_LENGTH} maxLength={USERNAME_MAX_LENGTH} value={username} onChange={e => setUsername(e.target.value.toLowerCase())} placeholder={editing ? "" : "Em branco: gerado a partir do e-mail"} /><small className="erp-muted">Usado no login, junto com e-mail e matrícula. Único na empresa.</small></label>
          <label className="modal-field"><span>Matrícula *</span><input name="matricula" required readOnly={!canEditMatricula} aria-readonly={!canEditMatricula} value={matricula} onChange={e => setMatricula(e.target.value)} placeholder="Ex.: MAT-0042" />{!canEditMatricula && <small className="erp-muted">Somente o administrador altera a matrícula.</small>}</label>
          <label className="modal-field"><span>Setor *</span><select name="setor" value={setor} onChange={e => setSetor(e.target.value)}>{SETORES.map(s => <option key={s}>{s}</option>)}</select></label>
          <label className="modal-field"><span>Perfil *</span><select name="perfil" value={perfil} disabled={self} onChange={e => choosePerfil(e.target.value as Perfil)}>{(perfisDisponiveis.includes(perfil) ? perfisDisponiveis : [perfil, ...perfisDisponiveis]).map(p => <option key={p}>{p}</option>)}</select>{self ? <small className="erp-muted">Você não altera o próprio perfil, módulos ou status.</small> : !meIsAdmin && <small className="erp-muted">Somente o administrador concede o perfil Administrador.</small>}</label>
          <label className="modal-field"><span>Status</span><select name="status" value={status} disabled={self || credTravadas} onChange={e => setStatus(e.target.value as "Ativo" | "Inativo")}><option>Ativo</option><option>Inativo</option></select></label>
          <label className="modal-field erp-span-2"><span>{editing ? "Nova senha (deixe em branco para manter)" : "Senha inicial *"} </span>
            <span className="erp-inline">
              <input name="senha" type={mostrarSenha ? "text" : "password"} disabled={credTravadas} autoComplete="new-password" required={!editing} minLength={PASSWORD_MIN_LENGTH} value={senha} onChange={e => setSenha(e.target.value)} placeholder={`Mínimo de ${PASSWORD_MIN_LENGTH} caracteres`} />
              <button type="button" className="button button--secondary button--compact" disabled={credTravadas} aria-pressed={mostrarSenha} aria-label={mostrarSenha ? "Ocultar senha" : "Mostrar senha"} onClick={() => setMostrarSenha(v => !v)}>{mostrarSenha ? <EyeOff size={14} /> : <Eye size={14} />} {mostrarSenha ? "Ocultar" : "Mostrar"}</button>
              <button type="button" className="button button--secondary button--compact" disabled={credTravadas} onClick={() => { setSenha(randomPassword()); setMostrarSenha(true); }}><KeyRound size={14} /> Gerar</button>
            </span>
            <small className="erp-muted">Entregue a senha à pessoa por um canal seguro. Ela pode trocá-la em Meu perfil.</small>
          </label>
        </div>
        <div className="access-section">
          <div className="access-section__heading"><div><span className="panel-kicker">Permissões por módulo</span><b>O que esta pessoa pode acessar?</b></div>{!meIsAdmin && !self && <small className="erp-muted">Você só concede módulos que você mesmo possui.</small>}<span className="selection-count">{isAdmin ? "Administrador: acesso total" : `${selected.length} módulo(s)`}</span></div>
          <div className="erp-perm-grid">
            {PERMISSION_KEYS.map(key => (
              <label key={key} className={`module-check ${isAdmin || permissoes[key] ? "module-check--selected" : ""}`}>
                <span>{PERMISSION_LABELS[key]}</span>
                <select aria-label={`Permissão ${PERMISSION_LABELS[key]}`} disabled={isAdmin || self} value={isAdmin ? "editar" : permissoes[key] ?? ""} onChange={e => setPermissoes(current => {
                  const next = { ...current };
                  if (e.target.value) next[key] = e.target.value as "ver" | "editar";
                  else delete next[key];
                  return next;
                })}>
                  <option value="">Sem acesso</option><option value="ver" disabled={!canGrant(key, "ver")}>Ver</option><option value="editar" disabled={!canGrant(key, "editar")}>Ver e editar</option>
                </select>
              </label>
            ))}
          </div>
        </div>
        <div className="access-user-preview erp-preview" aria-label="Prévia do acesso">
          <span className="preview-avatar">{initials(nome) || "?"}</span>
          <div><b>{nome || "Nome do usuário"}</b><small>{matricula || "matrícula"} · {perfil} · {setor}</small><small>{isAdmin ? "Acesso a todos os módulos" : selected.map(key => PERMISSION_LABELS[key]).join(", ") || "Apenas Meu perfil"}</small></div>
        </div>
        {error && <div className="erp-form-error" role="alert">{error}</div>}
        <div className="erp-modal-actions"><button type="button" className="button button--secondary" onClick={onClose}>Cancelar</button><button className="button button--primary" disabled={busy}>{busy && <Loader2 size={15} className="erp-spin" />}{editing ? "Salvar alterações" : "Cadastrar usuário"}</button></div>
      </form>
    </Modal>
  );
}

export default function UsuariosPage() {
  const { can, user: me } = useSession();
  const utils = trpc.useUtils();
  const canEdit = can("usuarios", "editar");
  const [searchInput, setSearchInput] = useState("");
  const search = useDebounced(searchInput);
  const [perfil, setPerfil] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [form, setForm] = useState<{ user?: UserRow } | null>(null);
  const [removing, setRemoving] = useState<UserRow | null>(null);
  useEffect(() => setPage(1), [search, perfil, status]);
  const list = trpc.usuarios.list.useQuery({ search: search || undefined, perfil: perfil || undefined, status: status || undefined, page, pageSize: 10 }, { placeholderData: p => p });
  const update = trpc.usuarios.update.useMutation();
  const remove = trpc.usuarios.remove.useMutation();
  // P6-01: só o administrador edita, desativa ou exclui administradores (o servidor também bloqueia)
  const protegido = (row: UserRow) => row.perfil === "Administrador" && me?.perfil !== "Administrador";
  // R-01: status e exclusão de quem tem mais acesso que eu ficam com o administrador
  const superior = (row: UserRow) => alemDoMeu(me, row).length > 0;
  const exportCsv = trpc.usuarios.exportCsv.useMutation();

  const toggleStatus = async (row: UserRow) => {
    try {
      await update.mutateAsync({ id: row.id, data: { status: row.status === "Ativo" ? "Inativo" : "Ativo" } });
      utils.usuarios.list.invalidate();
      toast.success(row.status === "Ativo" ? "Usuário desativado" : "Usuário reativado", { id: USUARIOS_TOAST, description: row.nome });
    } catch (error) {
      toast.error("Não foi possível alterar", { id: USUARIOS_TOAST, description: errorMessage(error) });
    }
  };
  const doRemove = async () => {
    if (!removing) return;
    try {
      await remove.mutateAsync({ id: removing.id });
      utils.usuarios.list.invalidate();
      toast.success("Usuário excluído", { id: USUARIOS_TOAST, description: removing.nome });
      setRemoving(null);
    } catch (error) {
      toast.error("Não foi possível excluir", { id: USUARIOS_TOAST, description: errorMessage(error) });
    }
  };
  const doExport = async () => {
    try {
      const out = await exportCsv.mutateAsync({ search: search || undefined, perfil: perfil || undefined, status: status || undefined });
      downloadFile(out.filename, out.csv);
      toast.success("Exportação concluída", { description: `${out.count} usuário(s)` });
    } catch (error) {
      toastError("Falha ao exportar", error);
    }
  };
  const rows = (list.data?.items ?? []) as UserRow[];

  return (
    <>
      <PageHeader eyebrow="Governança de acesso" title="Usuários e acessos" description="Cadastre pessoas com setor, perfil, matrícula e permissão por módulo. Cada usuário entra com o próprio e-mail, nome de usuário ou matrícula e a senha."
        actions={<><button type="button" className="button button--secondary" onClick={doExport} disabled={exportCsv.isPending}>{exportCsv.isPending ? <Loader2 size={16} className="erp-spin" /> : <Download size={16} />} Exportar CSV</button>{canEdit && <button type="button" className="button button--primary" onClick={() => setForm({})}><UserPlus size={16} /> Novo usuário</button>}</>} />
      <section className="panel user-list-panel" aria-label="Usuários cadastrados">
        <div className="panel-heading"><div><span className="panel-kicker">Usuários cadastrados</span><h2>Controle de acesso da equipe</h2></div></div>
        <div className="erp-toolbar" role="search">
          <label className="erp-search"><Search size={15} /><input aria-label="Buscar usuário" placeholder="Buscar por nome, e-mail, matrícula ou setor..." value={searchInput} onChange={e => setSearchInput(e.target.value)} />{searchInput && <button type="button" aria-label="Limpar busca" onClick={() => setSearchInput("")}><X size={14} /></button>}</label>
          <select aria-label="Filtrar por perfil" value={perfil} onChange={e => setPerfil(e.target.value)}><option value="">Todos os perfis</option>{PERFIS.map(p => <option key={p}>{p}</option>)}</select>
          <select aria-label="Filtrar por status" value={status} onChange={e => setStatus(e.target.value)}><option value="">Todos os status</option><option>Ativo</option><option>Inativo</option></select>
        </div>
        <div className="module-table-wrap">
          <table className="module-table users-table"><thead><tr><th>Usuário</th><th>Matrícula</th><th>Setor</th><th>Perfil</th><th>Módulos</th><th>Último acesso</th><th>Status</th><th className="row-actions-cell"><span className="sr-only">Ações</span></th></tr></thead><tbody>
            {list.isLoading ? <tr><td colSpan={8}><Spinner /></td></tr> : rows.length === 0 ? <tr><td colSpan={8}><EmptyState>Nenhum usuário encontrado.</EmptyState></td></tr> : rows.map(row => (
              <tr key={row.id} data-testid="user-row" onDoubleClick={() => canEdit && !protegido(row) && setForm({ user: row })}>
                <td className="module-primary"><span className="erp-primary-cell">{row.nome}{row.demo ? <DemoBadge /> : null}</span><small className="erp-muted erp-block users-email">{row.email}</small>{row.username ? <small className="erp-muted erp-block users-username" title="Nome de usuário">@{row.username}</small> : null}</td>
                <td>{row.matricula}</td><td>{row.setor}</td><td>{row.perfil}</td>
                {(() => {
                  const modulos = row.perfil === "Administrador" ? "Todos" : Object.keys(row.permissoes).map(k => PERMISSION_LABELS[k as keyof typeof PERMISSION_LABELS]).join(", ") || "Só Meu perfil";
                  return <td className="muted-cell users-modules" title={modulos}><span>{modulos}</span></td>;
                })()}
                <td className="muted-cell">{row.ultimoAcesso ? formatDateTime(row.ultimoAcesso) : "Nunca"}</td>
                <td><StatusPill label={row.status} /></td>
                <td className="row-actions-cell">{canEdit && <RowMenu label={row.nome} actions={[
                  { label: "Editar", onSelect: () => setForm({ user: row }), disabled: protegido(row), icon: <Pencil size={14} /> },
                  { label: row.status === "Ativo" ? "Desativar" : "Reativar", onSelect: () => toggleStatus(row), disabled: row.id === me?.id || protegido(row) || superior(row), icon: row.status === "Ativo" ? <UserX size={14} /> : <UserCheck size={14} /> },
                  { label: "Excluir", onSelect: () => setRemoving(row), danger: true, disabled: row.id === me?.id || protegido(row) || superior(row), icon: <Trash2 size={14} /> },
                ]} />}</td>
              </tr>
            ))}
          </tbody></table>
        </div>
        {list.data && <Pagination page={list.data.page} pages={list.data.pages} total={list.data.total} shown={rows.length} onPage={setPage} />}
      </section>
      {form && <UserForm user={form.user} onClose={() => setForm(null)} />}
      {removing && <ConfirmModal danger title="Excluir usuário?" confirmLabel="Excluir" busy={remove.isPending} onClose={() => setRemoving(null)} onConfirm={doRemove} message={<>{removing.nome} perderá o acesso imediatamente. O cadastro fica guardado para auditoria.</>} />}
    </>
  );
}
