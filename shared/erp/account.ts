/** Regras de conta compartilhadas entre front e servidor (login flexível). */

/** Política de senha: mínimo de 6 caracteres (pedido do cliente para uso local). */
export const PASSWORD_MIN_LENGTH = 6;
export const PASSWORD_MAX_LENGTH = 200;
export const PASSWORD_MIN_MESSAGE = `mínimo de ${PASSWORD_MIN_LENGTH} caracteres`;

/** Nome de usuário: 3 a 40 caracteres, letras minúsculas, números, ponto, hífen ou sublinhado. */
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 40;
export const USERNAME_PATTERN = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/;
export const USERNAME_MESSAGE = `Nome de usuário: use de ${USERNAME_MIN_LENGTH} a ${USERNAME_MAX_LENGTH} caracteres (letras sem acento, números, ponto, hífen ou sublinhado; sem espaço e sem @).`;

/** Comparação case-insensitive: guardamos sempre em minúsculas. */
export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

export function usernameError(value: string): string | null {
  const v = normalizeUsername(value);
  if (v.length < USERNAME_MIN_LENGTH || v.length > USERNAME_MAX_LENGTH || !USERNAME_PATTERN.test(v)) return USERNAME_MESSAGE;
  return null;
}

/** Deriva um nome de usuário válido a partir do e-mail (parte antes do @). */
export function usernameFromEmail(email: string): string {
  const local = email.trim().toLowerCase().split("@")[0] ?? "";
  let base = local
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9._-]+/g, ".")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, USERNAME_MAX_LENGTH)
    .replace(/[._-]+$/g, "");
  if (base.length < USERNAME_MIN_LENGTH) base = `${base || "usuario"}`.padEnd(USERNAME_MIN_LENGTH, "0");
  return base;
}

export type IdentifierKind = "email" | "usuario-ou-matricula";

/** O login aceita e-mail, nome de usuário ou matrícula num único campo. */
export function identifierKind(value: string): IdentifierKind {
  return value.includes("@") ? "email" : "usuario-ou-matricula";
}

/** Identificador normalizado (usado também como chave do limite de tentativas). */
export function normalizeIdentifier(value: string): string {
  return value.trim().toLowerCase();
}
