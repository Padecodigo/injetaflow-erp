/**
 * ISO 8859-1 (latin1) é o encoding obrigatório do AFD (leiaute AFD, item 2).
 * Cada byte vira exatamente um code point 0–255. Não usamos `TextDecoder("latin1")` porque o WHATWG
 * o trata como windows-1252, que muda os bytes 0x80–0x9F.
 */
export function decodificarLatin1(bytes: Uint8Array): string {
  let out = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    out += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return out;
}

/** Inverso de `decodificarLatin1`. Caracteres fora do latin1 viram "?" (0x3F). */
export function codificarLatin1(texto: string): Uint8Array {
  const out = new Uint8Array(texto.length);
  for (let i = 0; i < texto.length; i++) {
    const code = texto.charCodeAt(i);
    out[i] = code <= 0xff ? code : 0x3f;
  }
  return out;
}
