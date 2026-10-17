import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft, KeyRound, Loader2, LockKeyhole, Mail } from "lucide-react";
import { toast } from "sonner";
import { isKnownSpaRoute, LOGIN_ROUTE } from "@shared/erp/routes";
import { trpc } from "@/lib/trpc";
import { useSession } from "../session";
import { errorMessage } from "../api";
import { firstAllowedRoute } from "../guard";

function safeNext(): string | null {
  const next = new URLSearchParams(window.location.search).get("next");
  if (!next || !next.startsWith("/") || next.startsWith("//")) return null;
  const path = next.split("?")[0];
  return isKnownSpaRoute(path) && path !== LOGIN_ROUTE ? next : null;
}

/** Login do ERP: e-mail e senha validados no servidor. Nenhuma credencial aparece na tela (B12). */
export default function LoginPage() {
  const { user, loading, can } = useSession();
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const login = trpc.auth.login.useMutation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user) navigate(safeNext() ?? firstAllowedRoute(can), { replace: true });
  }, [loading, user, can, navigate]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      const me = await login.mutateAsync({ email, password });
      toast.dismiss();
      utils.auth.me.setData(undefined, me);
      toast.success("Sessão iniciada", { description: `${me.nome} · ${me.perfil}` });
    } catch (err) {
      const message = errorMessage(err);
      setError(message);
      toast.dismiss();
      toast.error("Não foi possível entrar", { description: message });
    }
  };

  return (
    <div className="erp-entry">
      <form className="erp-entry__card" onSubmit={submit} aria-label="Entrar no ERP">
        <img src="/tenant/wamovale-logo.jpg" alt="Wamovale" />
        <span className="portal-kicker">Área interna</span>
        <h1>Wamovale ERP</h1>
        <p>Entre com seu e-mail corporativo e senha para acessar seus módulos, seu ponto e seus dados.</p>
        <label className="modal-field"><span><Mail size={12} /> E-mail corporativo</span><input name="email" type="email" autoComplete="username" required autoFocus value={email} onChange={event => setEmail(event.target.value)} placeholder="voce@empresa.com.br" /></label>
        <label className="modal-field"><span><KeyRound size={12} /> Senha</span><input name="password" type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} placeholder="Sua senha" /></label>
        {error && <div className="erp-form-error" role="alert">{error}</div>}
        <button className="button button--portal erp-login-submit" type="submit" disabled={login.isPending || !email || !password}>
          {login.isPending ? <Loader2 size={16} className="erp-spin" /> : <KeyRound size={16} />} Entrar
        </button>
        <div className="modal-hint"><LockKeyhole size={14} /> O acesso abre somente os módulos liberados para o seu perfil. Esqueceu a senha? Fale com o administrador do sistema.</div>
        <Link className="erp-back-link" href="/"><ArrowLeft size={15} /> Voltar ao site público</Link>
      </form>
    </div>
  );
}
