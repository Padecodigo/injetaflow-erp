import type { TipoRegistroComNsr } from "./tipos";

/** Leiaute AFD da Portaria MTP 671/2021, versão "004" (gov.br, leiaute-do-arquivo-fonte-de-dados-afd.pdf). */
export const VERSAO_LEIAUTE_671 = "004";

export const TAMANHO_CABECALHO = 302;
export const TAMANHO_TRAILER = 64;
export const TAMANHO_ASSINATURA = 100;

/** Tamanho fixo da linha por tipo de registro com NSR. */
export const TAMANHO_POR_TIPO: Record<TipoRegistroComNsr, number> = {
  "2": 331,
  "3": 50,
  "4": 73,
  "5": 118,
  "6": 36,
  "7": 137,
};

export const TIPOS_COM_NSR = Object.keys(TAMANHO_POR_TIPO) as TipoRegistroComNsr[];

/** Tipos com CRC-16 no fim da linha (leiaute, item 8: registros "1" a "5"). */
export const TIPOS_COM_CRC = new Set(["1", "2", "3", "4", "5"]);

export const LITERAL_ASSINATURA_P7S = "ASSINATURA_DIGITAL_EM_ARQUIVO_P7S";

/** Códigos de evento sensível do tipo 6. */
export const EVENTOS_SENSIVEIS: Record<string, string> = {
  "01": "Abertura do REP por manutenção ou violação (REP-C)",
  "02": "Retorno de energia (REP-C ou REP-P)",
  "03": "Introdução de dispositivo externo de memória na Porta Fiscal (REP-C)",
  "04": "Retirada de dispositivo externo de memória na Porta Fiscal (REP-C)",
  "05": "Emissão da Relação Instantânea de Marcações (REP-C)",
  "06": "Erro de impressão (REP-C)",
  "07": "Disponibilidade de serviço (REP-P)",
  "08": "Indisponibilidade de serviço (REP-P)",
};

/** Coletor da marcação no tipo 7. */
export const COLETORES_REP_P: Record<string, string> = {
  "01": "Aplicativo mobile",
  "02": "Browser",
  "03": "Aplicativo desktop",
  "04": "Dispositivo eletrônico",
  "05": "Outro dispositivo eletrônico",
};
