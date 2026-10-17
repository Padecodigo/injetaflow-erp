/**
 * Regras de campos numéricos (quantidade, valor, peso, estoque, ciclo, cavidades...).
 * Usado pelo servidor (Zod) e pelo formulário do cliente, para a mensagem ser a mesma.
 */
export type NumericRule = { label: string; integer?: boolean; min?: number; max?: number; money?: boolean };

/** N03: tetos de negócio quando o campo não define o próprio máximo. */
export const DEFAULT_MAX = 1_000_000_000; // quantidades, saldos, ciclos, pesos: até 1 bilhão
export const MONEY_MAX = 1_000_000_000_000; // valores em R$: até 1 trilhão
export function maxOf(rule: Pick<NumericRule, "max" | "money">): number {
  return rule.max ?? (rule.money ? MONEY_MAX : DEFAULT_MAX);
}
export function maxDecimalsOf(rule: Pick<NumericRule, "integer" | "money">): number {
  return rule.integer ? 0 : rule.money ? 2 : 3;
}

/** N04: o texto tem separador decimal ("1.5", "1,5")? */
export function hasDecimalSeparator(value: unknown): boolean {
  return typeof value === "string" && /[.,]/.test(value);
}

const NUMERIC_TEXT = /^-?\d+(?:[.,]\d+)?$/;

/** Converte texto digitado ("1500", "12,5") em número. Retorna null se não for só número. */
export function parseNumeric(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!NUMERIC_TEXT.test(text)) return null;
  const parsed = Number(text.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

/** Valida um valor numérico. Retorna a mensagem de erro (em português) ou null se estiver ok. */
export function numericError(value: unknown, rule: NumericRule): string | null {
  // N04: em campo inteiro, "1.5"/"1,5" é recusado com mensagem (nunca vira 15)
  if (rule.integer && hasDecimalSeparator(value)) return `${rule.label}: use um número inteiro, sem vírgula ou ponto (ex.: 1500).`;
  const parsed = parseNumeric(value);
  if (parsed === null) return `${rule.label}: use apenas números${rule.integer ? " inteiros (ex.: 1500)" : " (ex.: 12,5)"}.`;
  const min = rule.min ?? 0;
  if (parsed < 0 && min >= 0) return `${rule.label}: não pode ser negativo.`;
  if (parsed < min) return `${rule.label}: o mínimo é ${formatPt(min)}.`;
  const max = maxOf(rule);
  if (parsed > max || !Number.isFinite(parsed)) return `${rule.label}: o máximo é ${formatPt(max)}.`;
  if (rule.integer && !Number.isSafeInteger(parsed)) return `${rule.label}: use um número inteiro, sem casas decimais.`;
  const decimals = typeof value === "string" ? (value.trim().split(/[.,]/)[1] ?? "").length : (String(value).split(".")[1] ?? "").length;
  const maxDecimals = maxDecimalsOf(rule);
  if (decimals > maxDecimals) return `${rule.label}: no máximo ${maxDecimals} ${maxDecimals === 1 ? "casa decimal" : "casas decimais"}.`;
  return null;
}

function formatPt(n: number): string {
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}

/** Teclas que um input numérico não deve aceitar (o navegador aceita "e", "+" e "-" em type=number). */
export const BLOCKED_NUMBER_KEYS = ["e", "E", "+", "-"];
