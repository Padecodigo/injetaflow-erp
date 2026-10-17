import { codificarLatin1 } from "./latin1";

/**
 * CRC-16/KERMIT (CRC-16 CCITT-TRUE): polinômio 0x1021 refletido (0x8408), valor inicial 0x0000,
 * entrada e saída refletidas, sem XOR final. Exigido pelo leiaute AFD (item 8, OBS) para REP-A e REP-P.
 * Vetor oficial: "123456789" → 0x2189, gravado como "2189".
 * Para REP-C o algoritmo segue os requisitos do INMETRO **[a confirmar]** (plano v2, §3.2).
 */
export function crc16Kermit(dados: Uint8Array | string): number {
  const bytes = typeof dados === "string" ? codificarLatin1(dados) : dados;
  let crc = 0x0000;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0x8408 : crc >>> 1;
    }
  }
  return crc & 0xffff;
}

/** Representação gravada no AFD: 4 dígitos hexadecimais, maiúsculos, sem "0x". */
export function crc16KermitHex(dados: Uint8Array | string): string {
  return crc16Kermit(dados).toString(16).toUpperCase().padStart(4, "0");
}
