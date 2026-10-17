/** N06: regra única de telefone (portal e servidor). Aceita dígitos, espaço, ( ) + - . com 10 a 13 dígitos (DDD + número, opcional +55). */
export const TELEFONE_MENSAGEM = "Telefone inválido: use DDD e número, só com dígitos (ex.: (12) 99999-0000).";

export function telefoneError(value: string | null | undefined): string | null {
  const text = (value ?? "").trim();
  if (!text) return null;
  if (!/^[0-9()+\-.\s]+$/.test(text)) return TELEFONE_MENSAGEM;
  if (text.includes("+") && !text.startsWith("+")) return TELEFONE_MENSAGEM;
  const digits = text.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 13) return TELEFONE_MENSAGEM;
  return null;
}
