import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { PASSWORD_MIN_LENGTH } from "@shared/erp/account";

const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 64;

/** Gera hash scrypt no formato `scrypt$N$r$p$salt$hash` (nunca guardar senha em texto). */
export function hashPassword(password: string): string {
  if (typeof password !== "string" || password.length < PASSWORD_MIN_LENGTH) throw new Error(`A senha precisa ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`);
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, KEYLEN, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function verifyPassword(password: string, stored: string | undefined | null): boolean {
  if (!stored || typeof password !== "string") return false;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltB64, hashB64] = parts;
  const expected = Buffer.from(hashB64, "base64");
  const actual = scryptSync(password, Buffer.from(saltB64, "base64"), expected.length, { N: Number(n), r: Number(r), p: Number(p) });
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Senha aleatória legível para o admin inicial ou redefinições. */
export function generatePassword(length = 16): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = randomBytes(length);
  return Array.from(bytes, byte => alphabet[byte % alphabet.length]).join("");
}
