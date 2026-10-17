import { sha256Hex } from "./hash";

/**
 * Hash SHA-256 do registro tipo 7 (leiaute AFD, item 9 e campo 8): calculado sobre NSR, tipo, DH da marcação,
 * CPF, DH da gravação, coletor, on/off-line e o hash do registro anterior, quando existir.
 *
 * **[a confirmar]** (plano v2, §3.2): a concatenação exata (separadores, encoding, caixa do hash anterior)
 * não está no leiaute. Aqui: campos 1 a 7 exatamente como gravados (posições 1–73 da linha), seguidos do
 * hash anterior em hexadecimal minúsculo, sem separador, em latin1. Validar com AFD real de REP-P antes de
 * tratar divergência como erro. Por isso o parser reporta a cadeia como **aviso** por padrão.
 */
export function calcularHashTipo7(camposBrutos1a7: string, hashAnterior?: string | null): string {
  return sha256Hex(camposBrutos1a7 + (hashAnterior ? hashAnterior.toLowerCase() : ""));
}
