import { createHash } from "node:crypto";
import { codificarLatin1 } from "./latin1";

/**
 * SHA-256 em hexadecimal minúsculo. Única dependência de runtime do pacote (`node:crypto`), que é
 * computação pura (sem I/O). Texto é codificado em latin1, o encoding do AFD.
 */
export function sha256Hex(dados: Uint8Array | string): string {
  const bytes = typeof dados === "string" ? codificarLatin1(dados) : dados;
  return createHash("sha256").update(bytes).digest("hex");
}
