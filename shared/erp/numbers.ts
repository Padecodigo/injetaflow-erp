/**
 * Regras de campos numéricos (quantidade, valor, peso, estoque, ciclo, cavidades...).
 * Usado pelo servidor (Zod) e pelo formulário do cliente, para a mensagem ser a mesma.
 */
export type NumericRule = { label: string; integer?: boolean; min?: number; max?: number };

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
  const parsed = parseNumeric(value);
  if (parsed === null) return `${rule.label}: use apenas números${rule.integer ? " inteiros (ex.: 1500)" : " (ex.: 12,5)"}.`;
  const min = rule.min ?? 0;
  if (parsed < 0 && min >= 0) return `${rule.label}: não pode ser negativo.`;
  if (parsed < min) return `${rule.label}: o mínimo é ${String(min).replace(".", ",")}.`;
  if (rule.max !== undefined && parsed > rule.max) return `${rule.label}: o máximo é ${String(rule.max).replace(".", ",")}.`;
  if (rule.integer && !Number.isInteger(parsed)) return `${rule.label}: use um número inteiro, sem casas decimais.`;
  return null;
}

/** Teclas que um input numérico não deve aceitar (o navegador aceita "e", "+" e "-" em type=number). */
export const BLOCKED_NUMBER_KEYS = ["e", "E", "+", "-"];
