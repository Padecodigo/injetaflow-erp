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
  // P8-R3-01: nenhum CRC do arquivo confere (CRC de outro algoritmo, ex.: INMETRO no REP-C)
  | "CRC_NAO_VERIFICAVEL"
  // P8-R4-01: proporção de CRC válido entre os limites (nem KERMIT nem outro algoritmo)
  | "CRC_INCONSISTENTE"
  | "HASH_CADEIA_INVALIDA"
  | "CADEIA_NAO_VERIFICAVEL"
  | "EMPREGADOR_FORA_DA_EMPRESA"
  // P8-R2-04: marcação depois de um tipo 2 que trocou o empregador para fora da empresa
  | "MARCACAO_SOB_OUTRO_EMPREGADOR"
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
  | "NSR_QUARENTENA"
  // P8-R2-01: preenchimento de lacuna (aviso) e lacuna incoerente com os vizinhos gravados (quarentena)
  | "PREENCHIMENTO_DE_LACUNA"
  | "LACUNA_INCOERENTE"
  // P8-R2-02: NSR muito acima do esperado
  | "NSR_SALTO_ANOMALO"
  // P8-R2-03: estado de entrada sem o hash de NSR que ele diz estar gravado
  | "ESTADO_INCOMPLETO";

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
  /** P8-R2-01: instante (ms UTC) que ordena o registro na sequência do REP (`instanteSequencial`); null se a DH é inválida. */
  instante: number | null;
  /** Códigos das inconsistências que atingem este registro (o registro continua sendo lido). */
  problemas: readonly CodigoInconsistencia[];
  /** Subconjunto de `problemas` com severidade "erro": o pipeline põe o registro em quarentena (P8-01). */
  errosGraves: readonly CodigoInconsistencia[];
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

/** P8-R4-01: limites da proporção de registros com CRC-16/KERMIT válido (0 a 1). */
export interface LimitesCrc {
  /** Proporção mínima para o arquivo ser verificável. Padrão 0,9 (90%). */
  minimoVerificavel: number;
  /** Proporção máxima para "CRC de outro algoritmo" (inclui coincidências, ~1/65.536 por linha). Padrão 0,01 (1%). */
  maximoNaoVerificavel: number;
}

/** P8-R4-01: resultado da conferência de CRC do arquivo. */
export interface ConferenciaCrc {
  situacao: "verificavel" | "nao-verificavel" | "inconsistente" | "sem-crc";
  verificavel: boolean;
  /** Registros com CRC (tipos 2 a 5). */
  comCrc: number;
  /** Desses, quantos conferem com o CRC-16/KERMIT. */
  conferem: number;
  /** `conferem / comCrc` (1 quando não há registro com CRC). */
  proporcao: number;
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
  /**
   * P8-R4-01: **caminho recomendado para a F2.** O CRC deste REP é o KERMIT (`true`) ou outro algoritmo (`false`),
   * conforme o algoritmo gravado no cadastro do REP. Sempre tem prioridade sobre a heurística de proporção.
   */
  crcVerificavel?: boolean;
  /** P8-R4-01: limites da heurística de proporção (sem `crcVerificavel`). Padrão `LIMITES_CRC_PADRAO` (90% / 1%). */
  limitesCrc?: Partial<LimitesCrc>;
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
  /**
   * P8-R3-01 / P8-R4-01: o CRC decide ordem e cursor? Vem de `opcoes.crcVerificavel` quando informado; senão da
   * proporção de CRC válido (≥ 90% → true; ≤ 1% → false com aviso `CRC_NAO_VERIFICAVEL`; entre os dois → false com
   * aviso `CRC_INCONSISTENTE`). null com `crc: "ignorar"` (sem opção explícita) ou arquivo rejeitado antes da leitura.
   */
  crcVerificavel: boolean | null;
  /**
   * P8-R4-01: proporção de CRC válido medida no arquivo (mesmo quando `crcVerificavel` veio da opção). A F2 pode
   * usá-la na 1ª importação para gravar o algoritmo do REP. null com `crc: "ignorar"` ou arquivo rejeitado.
   */
  crcConferencia: ConferenciaCrc | null;
}
