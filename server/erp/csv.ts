export const CSV_TIME_ZONE = "America/Sao_Paulo";
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/;

/**
 * N14: datas no CSV em pt-BR. "2026-10-17" → "17/10/2026";
 * "2026-10-17T16:05:00.000Z" → "17/10/2026 13:05" (horário de Brasília).
 */
export function formatCsvDate(value: string, timeZone = CSV_TIME_ZONE): string {
  if (ISO_DATE.test(value)) {
    const [y, m, d] = value.split("-");
    return `${d}/${m}/${y}`;
  }
  if (ISO_DATETIME.test(value)) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    const parts = Object.fromEntries(new Intl.DateTimeFormat("pt-BR", { timeZone, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date).map(p => [p.type, p.value]));
    return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}`;
  }
  return value;
}

/** Gera CSV compatível com Excel pt-BR (separador `;`, BOM UTF-8, aspas quando necessário). */
export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const escape = (value: string | number | null | undefined) => {
    if (value === null || value === undefined) return "";
    let text = typeof value === "string" ? formatCsvDate(value.trim()) : String(value);
    // evita injeção de fórmula ao abrir no Excel
    if (/^[=+\-@\t\r]/.test(text) && !/^-?\d+([.,]\d+)?$/.test(text)) text = `'${text}`;
    return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [headers.map(escape).join(";"), ...rows.map(row => row.map(escape).join(";"))];
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}
