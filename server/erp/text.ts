export function normalizeText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function todayIso(date = new Date()): string {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10);
}

export function localDateOf(iso: string): string {
  return todayIso(new Date(iso));
}

/**
 * B-13: caracteres de controle (NUL etc.) e de direção do texto (U+202E "RLO", isolamentos bidi) não
 * entram em campos de texto: servem para disfarçar nomes ("fatura‮txt.exe") e quebram exportações.
 * Tabulação e quebra de linha continuam aceitas (textos longos).
 */
// eslint-disable-next-line no-control-regex -- intencional: é justamente para detectar caracteres de controle
const CONTROLE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200E\u200F\u202A-\u202E\u2066-\u2069]/;
export function semCaracteresDeControle(value: unknown): boolean {
  return !CONTROLE.test(String(value ?? ""));
}

/** B-13: AAAA-MM-DD que existe no calendário (recusa 2026-13-45 e 2026-02-30). */
export function dataDeCalendarioValida(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [ano, mes, dia] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  return data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia;
}
