import { Link } from "wouter";
import { ArrowLeft, Compass } from "lucide-react";

/** 404 real (B16): o servidor também responde HTTP 404 para esta rota. */
export default function NotFound() {
  return (
    <main className="not-found" data-testid="not-found">
      <div className="not-found__card">
        <img src="/tenant/wamovale-logo.jpg" alt="Wamovale" className="not-found__logo" onError={e => (e.currentTarget.style.display = "none")} />
        <span className="not-found__icon"><Compass size={30} /></span>
        <span className="eyebrow">Erro 404</span>
        <h1>Página não encontrada</h1>
        <p>O endereço <code>{typeof window !== "undefined" ? window.location.pathname : ""}</code> não existe ou foi movido.</p>
        <div className="not-found__actions">
          <Link className="button button--primary" href="/"><ArrowLeft size={16} /> Voltar ao site</Link>
          <Link className="button button--secondary" href="/erp">Entrar no ERP</Link>
        </div>
      </div>
    </main>
  );
}
