import type { DataHoraAfd } from "./campos";

export type { DataHoraAfd };

/** Tipo de REP (Portaria 671, art. 75): C convencional, A alternativo, P programa. */
export type TipoRep = "C" | "A" | "P";

export type Severidade = "erro" | "aviso";

export type CodigoInconsistencia =
  | "ARQUIVO_VAZIO"
  // P8-09: encoding e quebras de linha (detectados antes do leiaute, com mensagem própria)
  | "BOM_UTF8"
  | "QUEBRA_CR_SOLTO"
  | "ENCODING_UTF8"
  | "QUEBRA_LF"
  | "SEM_QUEBRA_FINAL"
  | "LINHA_EM_BRANCO"
  | "LEIAUTE_NAO_SUPORTADO"
  | "CABECALHO_AUSENTE"
  | "CABECALHO_DUPLICADO"
  | "CABECALHO_FORA_DE_POSICAO"
  | "TIPO_DESCONHECIDO"
  | "TAMANHO_INVALIDO"
  | "CAMPO_INVALIDO"
  | "DH_SEGUNDOS"
  | "CPF_INVALIDO"
  | "CNPJ_CPF_INVALIDO"
  | "CRC_INVALIDO"
  | "HASH_CADEIA_INVALIDA"
  | "CADEIA_NAO_VERIFICAVEL"
  | "EMPREGADOR_FORA_DA_EMPRESA"
  | "NSR_FORA_DE_ORDEM"
  | "NSR_DUPLICADO_NO_ARQUIVO"
  | "DATA_FORA_DO_PERIODO"
  | "TRAILER_AUSENTE"
  | "TRAILER_DUPLICADO"
  | "TRAILER_DIVERGENTE"
  | "REGISTRO_APOS_TRAILER"
  | "ASSINATURA_AUSENTE"
  | "ASSINATURA_INVALIDA"
  // do pipeline de importação (dependem do estado já gravado)
  | "NSR_CONFLITO"
  | "NSR_LACUNA"
  | "NSR_RETROCESSO"
  | "NSR_ABAIXO_DO_CURSOR"
  | "NSR_QUARENTENA";

export interface Inconsistencia {
  codigo: CodigoInconsistencia;
  severidade: Severidade;
  /** Mensagem em português. Nunca traz CPF ou outro dado pessoal. */
  mensagem: string;
  numeroLinha?: number;
  nsr?: number;
  campo?: string;
}

interface LinhaBase {
  numeroLinha: number;
  /** Linha como está no arquivo, sem o CR LF. */
  linhaBruta: string;
  /** SHA-256 (hex) da linha bruta em latin1, base da idempotência. */
  linhaHash: string;
}

export interface Cabecalho extends LinhaBase {
  tipo: "1";
  tpIdEmpregador: string;
  idEmpregador: string;
  cnoCaepf: string;
  razaoSocial: string;
  /** Campo 7: nº de fabricação (REP-C), processo do ACT (REP-A) ou nº INPI (REP-P). */
  numeroRep: string;
  dataInicial: string | null;
  dataFinal: string | null;
  geradoEm: DataHoraAfd | null;
  versaoLeiaute: string;
  tpIdFabricante: string;
  idFabricante: string;
  modeloRep: string;
  crc: string;
}

interface RegistroBase extends LinhaBase {
  nsr: number;
  /** Códigos das inconsistências que atingem este registro (o registro continua sendo lido). */
  problemas: CodigoInconsistencia[];
  /** Subconjunto de `problemas` com severidade "erro": o pipeline põe o registro em quarentena (P8-01). */
  errosGraves: CodigoInconsistencia[];
}

export interface RegistroEmpresa extends RegistroBase {
  tipo: "2";
  gravadoEm: DataHoraAfd | null;
  cpfResponsavel: string | null;
  tpIdEmpregador: string;
  idEmpregador: string;
  cnoCaepf: string;
  razaoSocial: string;
  local: string;
  crc: string;
}

export interface RegistroMarcacaoRepC extends RegistroBase {
  tipo: "3";
  marcadoEm: DataHoraAfd | null;
  cpf: string | null;
  crc: string;
}

export interface RegistroAjusteRelogio extends RegistroBase {
  tipo: "4";
  antes: DataHoraAfd | null;
  ajustadoPara: DataHoraAfd | null;
  cpfResponsavel: string | null;
  crc: string;
}

export interface RegistroEmpregado extends RegistroBase {
  tipo: "5";
  gravadoEm: DataHoraAfd | null;
  operacao: string;
  cpf: string | null;
  nome: string;
  demaisDados: string;
  cpfResponsavel: string | null;
  crc: string;
}

export interface RegistroEventoSensivel extends RegistroBase {
  tipo: "6";
  gravadoEm: DataHoraAfd | null;
  codigoEvento: string;
}

export interface RegistroMarcacaoRepP extends RegistroBase {
  tipo: "7";
  marcadoEm: DataHoraAfd | null;
  cpf: string | null;
  gravadoEm: DataHoraAfd | null;
  coletor: string;
  offline: boolean | null;
  hash: string;
}

export type Registro = RegistroEmpresa | RegistroMarcacaoRepC | RegistroAjusteRelogio | RegistroEmpregado | RegistroEventoSensivel | RegistroMarcacaoRepP;
export type TipoRegistroComNsr = Registro["tipo"];

export interface Trailer extends LinhaBase {
  quantidades: Record<TipoRegistroComNsr, number | null>;
}

export interface Assinatura extends LinhaBase {
  /** Literal "ASSINATURA_DIGITAL_EM_ARQUIVO_P7S" + espaços (REP-A/REP-P); assinatura real no .p7s. */
  literalP7s: boolean;
}

/** Linha que não pôde virar registro (tipo desconhecido, tamanho ou NSR inválido). Nunca é descartada em silêncio. */
export interface LinhaInvalida extends LinhaBase {
  tipo: string | null;
  nsr: number | null;
  motivo: CodigoInconsistencia;
}

export interface OpcoesParser {
  /** Tipo de REP conhecido pelo cadastro. Sem isso, é inferido (tipo 7 presente → "P"). */
  tipoRep?: TipoRep;
  /** Severidade do CRC-16. Padrão: "erro" para REP-A/REP-P, "aviso" para REP-C ou tipo desconhecido (algoritmo INMETRO a confirmar). */
  crc?: Severidade | "ignorar";
  /** Severidade da cadeia de hash do tipo 7. Padrão "aviso": a concatenação exata está [a confirmar]. */
  cadeiaHash?: Severidade | "ignorar";
  /**
   * Hash do registro tipo 7 anterior ao primeiro do arquivo (arquivo parcial, coletado a partir de um NSR).
   * Sem ele, o primeiro elo só é verificado se o arquivo começa no NSR 1; senão vira `CADEIA_NAO_VERIFICAVEL` (P8-05).
   */
  hashAnteriorInicial?: string;
  /**
   * CNPJs/CPFs dos estabelecimentos da empresa da sessão (P8-04). Quando informado, cabeçalho com outro empregador
   * rejeita o arquivo (`EMPREGADOR_FORA_DA_EMPRESA`, erro) e registro tipo 2 com outro empregador vai para quarentena.
   * Aceita com ou sem pontuação; CPF com 11 dígitos, CNPJ com 14 caracteres (numérico ou alfanumérico).
   */
  empregadoresPermitidos?: readonly string[];
}

export interface ResultadoParser {
  leiaute: "671-004" | "nao-suportado" | "vazio";
  tipoRep: TipoRep | null;
  sha256Arquivo: string;
  totalLinhas: number;
  cabecalho: Cabecalho | null;
  registros: Registro[];
  invalidas: LinhaInvalida[];
  trailer: Trailer | null;
  assinatura: Assinatura | null;
  /** Linhas por tipo (2 a 7) efetivamente lidas, inclusive as com tamanho inválido. */
  contagemPorTipo: Record<TipoRegistroComNsr, number>;
  inconsistencias: Inconsistencia[];
  /** Motivos que rejeitam o arquivo inteiro (vazio, encoding, leiaute, sem cabeçalho, empregador fora da empresa). */
  motivosRejeicao: CodigoInconsistencia[];
}
