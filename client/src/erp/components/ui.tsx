import { useEffect, useRef, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { createPortal } from "react-dom";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { Loader2, MoreHorizontal, X } from "lucide-react";
import { toneFor, type Tone } from "../format";
import { numericError } from "@shared/erp/numbers";
import { pushModal } from "../modalStack";

const TONES: Record<Tone, { color: string; background: string }> = {
  teal: { color: "#0a8f80", background: "#e4faf6" },
  orange: { color: "#c46a14", background: "#fff3e4" },
  red: { color: "#c94548", background: "#fff0f0" },
  blue: { color: "#3a63c4", background: "#edf2ff" },
  lime: { color: "#5d7e14", background: "#f1f9d9" },
  gray: { color: "#66737c", background: "#f0f3f5" },
};

export function StatusPill({ label, tone }: { label: string; tone?: Tone }) {
  const style = TONES[tone ?? toneFor(label)];
  return (
    <span className="status-pill" style={{ color: style.color, background: style.background }}>
      <span className="status-dot" style={{ background: style.color }} />
      {label}
    </span>
  );
}

export function DemoBadge() {
  return <span className="erp-demo-badge" title="Dado de exemplo para demonstração. Não é dado real.">DEMO</span>;
}

export function Spinner({ label = "Carregando..." }: { label?: string }) {
  return (
    <span className="erp-spinner" role="status">
      <Loader2 size={16} className="erp-spin" /> {label}
    </span>
  );
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Modal acessível com as classes visuais do protótipo (fecha com Esc e no X).
 * F-02 (auditoria de frontend): o modal é renderizado em portal no <body>, deixa o resto da página
 * `inert` (fora do Tab e do leitor de tela), prende o Tab dentro dele e, ao fechar, devolve o foco
 * ao elemento que o abriu.
 */
export function Modal({ title, eyebrow, description, icon, onClose, children, wide, labelledBy = "erp-modal-title" }: {
  title: string; eyebrow?: string; description?: ReactNode; icon?: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean; labelledBy?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const backdrop = backdropRef.current;
    // o resto da página fica inerte enquanto o modal está aberto (modais empilhados: só o de cima fica ativo)
    const inerted: HTMLElement[] = [];
    if (backdrop) {
      for (const el of Array.from(document.body.children)) {
        if (el === backdrop || !(el instanceof HTMLElement) || el.inert || el.tagName === "SCRIPT") continue;
        if (el.querySelector("[data-radix-popper-content-wrapper]") || el.hasAttribute("data-radix-popper-content-wrapper")) continue;
        el.inert = true;
        inerted.push(el);
      }
    }
    const onKey = (event: KeyboardEvent) => {
      // só o modal do topo reage (o de baixo está inerte)
      if (!backdrop || backdrop.inert) return;
      if (event.key === "Escape") { event.stopPropagation(); onCloseRef.current(); return; }
      if (event.key !== "Tab" || !ref.current) return;
      const items = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(el => el.offsetParent !== null || el === document.activeElement);
      if (!items.length) { event.preventDefault(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !ref.current.contains(active))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (active === last || !ref.current.contains(active))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    const popModal = pushModal();
    const first = ref.current?.querySelector<HTMLElement>("input:not([type=hidden]):not([disabled]), select, textarea, button.erp-autofocus");
    (first ?? ref.current)?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      popModal();
      for (const el of inerted) el.inert = false;
      if (opener && opener.isConnected) opener.focus();
    };
  }, []);
  return createPortal(
    <div ref={backdropRef} className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={ref} tabIndex={-1} className={`access-modal erp-modal ${wide ? "erp-modal--wide" : ""}`} role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
        <button type="button" className="modal-close" aria-label="Fechar" onClick={onClose}><X size={18} /></button>
        {icon && <div className="access-modal__icon">{icon}</div>}
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h2 id={labelledBy}>{title}</h2>
        {description && <p>{description}</p>}
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmModal({ title, message, confirmLabel = "Confirmar", danger, busy, onConfirm, onClose }: {
  title: string; message: ReactNode; confirmLabel?: string; danger?: boolean; busy?: boolean; onConfirm: () => void; onClose: () => void;
}) {
  return (
    <Modal title={title} onClose={onClose} labelledBy="erp-confirm-title">
      <p className="erp-confirm-text">{message}</p>
      <div className="erp-modal-actions">
        <button type="button" className="button button--secondary" onClick={onClose}>Cancelar</button>
        <button type="button" className={`button ${danger ? "button--danger" : "button--primary"} erp-autofocus`} disabled={busy} onClick={onConfirm}>
          {busy ? <Loader2 size={15} className="erp-spin" /> : null}{confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

export type MenuAction = { label: string; onSelect: () => void; danger?: boolean; disabled?: boolean; icon?: ReactNode };

/** Menu "⋯" da linha com ações reais (B04). */
export function RowMenu({ actions, label }: { actions: MenuAction[]; label: string }) {
  return (
    <Dropdown.Root modal={false}>
      <Dropdown.Trigger asChild>
        <button type="button" className="row-more" aria-label={`Ações de ${label}`} onClick={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()}>
          <MoreHorizontal size={17} />
        </button>
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content className="erp-menu" align="end" sideOffset={4} onClick={event => event.stopPropagation()}>
          {actions.map(action => (
            <Dropdown.Item key={action.label} className={`erp-menu__item ${action.danger ? "erp-menu__item--danger" : ""}`} disabled={action.disabled} onSelect={() => action.onSelect()}>
              {action.icon}{action.label}
            </Dropdown.Item>
          ))}
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}

export function Pagination({ page, pages, total, shown, onPage }: { page: number; pages: number; total: number; shown: number; onPage: (page: number) => void }) {
  const numbers: number[] = [];
  const start = Math.max(1, Math.min(page - 2, pages - 4));
  for (let n = start; n <= Math.min(pages, start + 4); n++) numbers.push(n);
  return (
    <div className="table-footer erp-table-footer">
      <span>Mostrando <b>{shown}</b> de <b>{total}</b> registro{total === 1 ? "" : "s"}{pages > 1 ? ` · página ${page} de ${pages}` : ""}</span>
      <nav className="pagination" aria-label="Paginação">
        <button type="button" className="page-button" aria-label="Página anterior" disabled={page <= 1} onClick={() => onPage(page - 1)}>‹</button>
        {numbers.map(n => (
          <button type="button" key={n} aria-label={`Página ${n}`} aria-current={n === page ? "page" : undefined} className={`page-button ${n === page ? "page-button--active" : ""}`} onClick={() => onPage(n)}>{n}</button>
        ))}
        <button type="button" className="page-button" aria-label="Próxima página" disabled={page >= pages} onClick={() => onPage(page + 1)}>›</button>
      </nav>
    </div>
  );
}

export function Metric({ label, value, note, tone = "teal" }: { label: string; value: ReactNode; note?: ReactNode; tone?: Tone }) {
  const style = TONES[tone];
  return (
    <article className="metric-card">
      <div className="metric-card__top"><span className="metric-label">{label}</span><span className="metric-signal" style={{ background: style.background, color: style.color }}>●</span></div>
      <div className="metric-value">{value}</div>
      {note && <div className="metric-foot"><span className="metric-note metric-note--strong" style={{ color: style.color }}>{note}</span></div>}
    </article>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="erp-empty">{children}</div>;
}

export function useDebounced<T>(value: T, delay = 300): T {
  const [state, setState] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setState(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return state;
}

/**
 * Campo numérico (quantidade, valor, peso, estoque, ciclo, cavidades...).
 * - teclado numérico no celular (inputMode) e só aceita dígitos e separador decimal;
 * - qualquer outro caractere é recusado COM aviso (nunca some em silêncio);
 * - N04: em campo inteiro, "1.5"/"1,5" fica visível e com erro em vez de virar 15;
 * - N03/N10: mínimo, máximo e casas decimais validados com mensagem em português junto ao campo.
 */
export function NumberInput({ value, onChange, integer, money, min = 0, max, label = "Valor", step: _step, ...rest }: {
  value: string; onChange: (value: string) => void; integer?: boolean; money?: boolean; min?: number; max?: number; label?: string; step?: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type" | "min" | "max" | "step">) {
  const [warning, setWarning] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const warn = (message: string) => {
    setWarning(message);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setWarning(null), 3500);
  };
  const rule = { label, integer, money, min, max };
  const liveError = value.trim() ? numericError(value, rule) : null;
  const message = warning ?? liveError;
  const accept = (text: string) => /^[0-9.,]*$/.test(text) && (text.match(/[.,]/g) ?? []).length <= 1;
  return (
    <>
      <input
        {...rest}
        type="text"
        inputMode={integer ? "numeric" : "decimal"}
        autoComplete="off"
        data-numeric={integer ? "integer" : "decimal"}
        aria-invalid={Boolean(liveError) || rest["aria-invalid"] === true || undefined}
        value={value}
        onChange={event => {
          const next = event.target.value.replace(/\s+/g, "");
          if (!accept(next)) {
            warn(`${label}: digite apenas números${integer ? " inteiros" : ""}${min >= 0 ? " (sem sinal de menos)" : ""}.`);
            return;
          }
          setWarning(null);
          onChange(next);
        }}
        onPaste={event => {
          const text = event.clipboardData.getData("text").trim();
          if (!accept(text)) {
            event.preventDefault();
            warn(`${label}: o texto colado não é um número válido.`);
          }
        }}
      />
      {message && <small className="erp-field-error" role="alert">{message}</small>}
    </>
  );
}
