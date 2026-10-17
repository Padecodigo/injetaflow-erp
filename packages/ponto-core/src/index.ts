/**
 * ponto-core: domínio puro do ponto (plano RH/Ponto v2, §4.8; v3 mantém). Sem I/O, sem banco, sem HTTP,
 * sem relógio do sistema e sem framework. Fatia F1: parser do AFD (Portaria 671, leiaute 004),
 * relatório de inconsistências, chaves de idempotência e decisão do pipeline de importação.
 */
export * from "./tipos";
export { parseAfd, normalizarEmpregador, instanteSequencial } from "./parser";
export { crc16Kermit, crc16KermitHex } from "./crc16";
export { calcularHashTipo7 } from "./cadeia-hash";
export { sha256Hex } from "./hash";
export { decodificarLatin1, codificarLatin1 } from "./latin1";
export { campo, lerData, lerDataHora, lerCpf12, lerCpfResponsavel, cpfValido, cnpjValido } from "./campos";
export { chaveNatural, chaveIdempotencia, identificadorRep, type ComponentesChave } from "./idempotencia";
export { decidirImportacao, planejarImportacao, type EstadoConhecido, type LinhaParaDecisao, type DecisaoImportacao, type Conflito, type Quarentena, type Lacuna, type Retrocesso, type OpcoesDecisao, LIMITE_SALTO_NSR_PADRAO, TOLERANCIA_LACUNA_MS_PADRAO } from "./pipeline";
export { relatorioImportacao, inconsistenciasDaImportacao, inconsistenciasCsv, type RelatorioImportacao, type StatusImportacao } from "./relatorio";
export * from "./leiaute671";
