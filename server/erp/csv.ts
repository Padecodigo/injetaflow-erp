/** Gera CSV compatível com Excel pt-BR (separador `;`, BOM UTF-8, aspas quando necessário). */
export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const escape = (value: string | number | null | undefined) => {
    if (value === null || value === undefined) return "";
    let text = String(value);
    // evita injeção de fórmula ao abrir no Excel
    if (/^[=+\-@\t\r]/.test(text) && !/^-?\d+([.,]\d+)?$/.test(text)) text = `'${text}`;
    return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [headers.map(escape).join(";"), ...rows.map(row => row.map(escape).join(";"))];
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}
