/**
 * Mascara campos sensíveis antes de qualquer log de depuração (senha, password, token e similares).
 * Usado pelo coletor de logs do modo dev (vite.config.ts → .manus-logs/) como defesa em profundidade:
 * mesmo que o navegador mande o corpo de um login ou troca de senha, nada disso vai para o disco.
 */

export const MASCARA = "[REDACTED]";

/** Nomes de campo sensíveis (comparação sem acento/caixa, por trecho do nome). */
const SENSIVEIS = /(senha|password|passwd|pwd|passphrase|token|secret|segredo|authorization|cookie|session|sessao|api[-_]?key|apikey|chave|credential|credencial|hash|otp|pin\b)/i;

export function campoSensivel(nome: string): boolean {
  return SENSIVEIS.test(nome.normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
}

/** "senha":"x" / senha=x / Authorization: Bearer x dentro de textos (corpos não parseados, URLs, mensagens). */
const EM_JSON = new RegExp(`("(?:[^"\\\\]|\\\\.)*?(?:${SENSIVEIS.source.slice(1, -1)})(?:[^"\\\\]|\\\\.)*?"\\s*:\\s*)("(?:[^"\\\\]|\\\\.)*"|[^,}\\]\\s]+)`, "gi");
const EM_QUERY = new RegExp(`([?&;\\s]?[\\w.-]*(?:${SENSIVEIS.source.slice(1, -1)})[\\w.-]*=)([^&;\\s"]+)`, "gi");
const BEARER = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/g;

export function mascararTexto(texto: string): string {
  return texto
    .replace(EM_JSON, (_m, chave: string) => `${chave}"${MASCARA}"`)
    .replace(EM_QUERY, (_m, chave: string) => `${chave}${MASCARA}`)
    .replace(BEARER, (_m, tipo: string) => `${tipo} ${MASCARA}`);
}

export function mascararSensiveis(valor: unknown, profundidade = 0, vistos = new WeakSet<object>()): unknown {
  if (typeof valor === "string") return mascararTexto(valor);
  if (valor === null || typeof valor !== "object") return valor;
  if (profundidade > 20) return "[Max Depth]";
  if (vistos.has(valor)) return "[Circular]";
  vistos.add(valor);
  if (Array.isArray(valor)) return valor.map(item => mascararSensiveis(item, profundidade + 1, vistos));
  const saida: Record<string, unknown> = {};
  for (const [chave, item] of Object.entries(valor)) {
    saida[chave] = campoSensivel(chave) ? MASCARA : mascararSensiveis(item, profundidade + 1, vistos);
  }
  return saida;
}

/** Linhas do arquivo de log de depuração, já mascaradas. */
export function linhasDeLogMascaradas(entries: unknown[], agora: () => Date = () => new Date()): string[] {
  return entries.map(entry => `[${agora().toISOString()}] ${JSON.stringify(mascararSensiveis(entry))}`);
}
