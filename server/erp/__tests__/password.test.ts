import { describe, expect, it } from "vitest";
import { generatePassword, hashPassword, verifyPassword } from "../password";

describe("hash de senha", () => {
  it("B12: guarda hash scrypt (nunca a senha) e verifica corretamente", () => {
    const hash = hashPassword("uma-senha-forte");
    expect(hash).not.toContain("uma-senha-forte");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(verifyPassword("uma-senha-forte", hash)).toBe(true);
    expect(verifyPassword("outra", hash)).toBe(false);
    expect(verifyPassword("x", "lixo")).toBe(false);
  });
  it("gera hashes diferentes para a mesma senha (salt)", () => {
    expect(hashPassword("12345678")).not.toBe(hashPassword("12345678"));
  });
  it("recusa senha curta e gera senhas aleatórias", () => {
    expect(() => hashPassword("123")).toThrow();
    expect(generatePassword(16)).toHaveLength(16);
    expect(generatePassword()).not.toBe(generatePassword());
  });
});
