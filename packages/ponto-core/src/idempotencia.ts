import type { Cabecalho, TipoRep } from "./tipos";

/**
 * Chaves de idempotência da importação (plano v2, §3.3). Tudo prefixado pela empresa (tenant),
 * que sempre vem do contexto autenticado, nunca do arquivo.
 *
 * - **Chave natural** da marcação/evento: (empresa, REP, NSR). Duas linhas com a mesma chave natural são o
 *   mesmo registro do REP.
 * - **Chave de idempotência**: chave natural + SHA-256 da linha bruta. Mesma chave = duplicata (ignora);
 *   mesma chave natural com hash diferente = conflito (`NSR_CONFLITO`, nunca sobrescreve).
 *
 * Os componentes são codificados com `encodeURIComponent`, então o separador "|" nunca é ambíguo.
 */
export interface ComponentesChave {
  empresaId: string;
  repId: string;
  nsr: number;
}

const parte = (valor: string) => encodeURIComponent(valor);
const nsr9 = (nsr: number) => String(Math.trunc(nsr)).padStart(9, "0");

export function chaveNatural({ empresaId, repId, nsr }: ComponentesChave): string {
  return `${parte(empresaId)}|${parte(repId)}|${nsr9(nsr)}`;
}

export function chaveIdempotencia(c: ComponentesChave & { linhaHash: string }): string {
  return `${chaveNatural(c)}|${c.linhaHash.toLowerCase()}`;
}

/**
 * Identificador do REP a partir do cabeçalho (plano v2, §3.3): REP-C pelo nº de fabricação + CNPJ/CPF
 * do empregador; REP-P pelo nº INPI + CNPJ/CPF; REP-A pelo CNPJ/CPF + identificador configurado (FAQ 42).
 * É a chave usada para achar o `rep_id` cadastrado; o cadastro em si é responsabilidade do caso de uso.
 */
export function identificadorRep(cabecalho: Pick<Cabecalho, "idEmpregador" | "numeroRep">, tipoRep: TipoRep, idConfiguradoRepA?: string): string {
  const empregador = cabecalho.idEmpregador.trim().toUpperCase();
  if (tipoRep === "A") return `A:${parte(empregador)}:${parte((idConfiguradoRepA ?? "").trim())}`;
  return `${tipoRep}:${parte(empregador)}:${parte(cabecalho.numeroRep.trim())}`;
}
