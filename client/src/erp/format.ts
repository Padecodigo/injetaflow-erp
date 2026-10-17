import type { FieldDef } from "@shared/erp/modules";

const nf = new Intl.NumberFormat("pt-BR");
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatDate(value: unknown): string {
  if (!value) return "—";
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text.split("-").reverse().join("/");
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? text : date.toLocaleDateString("pt-BR");
}

export function formatDateTime(value: unknown): string {
  if (!value) return "—";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function formatTime(value: unknown): string {
  if (!value) return "—";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function formatNumber(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  return Number.isFinite(n) ? nf.format(n) : String(value);
}

export function formatMoney(value: unknown): string {
  const n = Number(value);
  return Number.isFinite(n) ? money.format(n) : "—";
}

export function formatValue(field: FieldDef | undefined, column: string, value: unknown): string {
  if (column === "createdAt" || column === "updatedAt" || field?.type === "datetime") return formatDateTime(value);
  if (column === "progresso") return `${Number(value ?? 0)}%`;
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (!field) return value === undefined || value === null || value === "" ? "—" : String(value);
  switch (field.type) {
    case "date":
      return formatDate(value);
    case "number":
      return formatNumber(value);
    case "money":
      return formatMoney(value);
    default:
      return value === undefined || value === null || value === "" ? "—" : String(value);
  }
}

/** Data longa real do sistema (corrige a data fixa do protótipo — B15). */
export function longToday(date = new Date()): string {
  const text = date.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function shortToday(date = new Date()): string {
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

export function greeting(date = new Date()): string {
  const hour = date.getHours();
  return hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
}

export function todayInput(date = new Date()): string {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10);
}

export function initials(name: string | undefined | null): string {
  return (name ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .map(part => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export type Tone = "teal" | "orange" | "red" | "blue" | "lime" | "gray";

const TONE_BY_STATUS: Record<string, Tone> = {
  "Em produção": "teal", Liberada: "blue", Planejada: "gray", Pausada: "orange", Concluída: "lime", Cancelada: "red",
  Aberto: "orange", "Em análise": "blue", Quarentena: "red", Liberado: "teal", Aprovado: "teal", Reprovado: "red", Encerrado: "gray",
  Normal: "teal", Reposição: "orange", Bloqueado: "red",
  Disponível: "teal", "Em uso": "blue", "Em manutenção": "orange", Atenção: "orange", Inativo: "gray", Inativa: "gray", Ativa: "teal",
  "Em teste": "orange", Aberta: "orange", "Em execução": "blue", "Aguardando peça": "orange",
  Ativo: "teal", Férias: "blue", Afastado: "orange", Desligado: "gray",
  "Em aberto": "orange", Pago: "teal", Recebido: "teal", Atrasado: "red",
  Novo: "orange", "Em atendimento": "blue", Respondido: "teal", Arquivado: "gray",
  Presente: "teal", "Em intervalo": "orange", Saiu: "gray", Ausente: "red",
  Regular: "teal", Incompleto: "orange", "Sem expediente": "gray", Pendente: "orange",
  Urgente: "red", Alta: "orange", Crítica: "red", "Parada imediata": "red",
};

export function toneFor(status: unknown): Tone {
  return TONE_BY_STATUS[String(status)] ?? "gray";
}
