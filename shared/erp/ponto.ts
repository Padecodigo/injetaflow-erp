/**
 * F0c (plano RH/Ponto v3, §7): o ERP não registra ponto. A marcação oficial é feita só no relógio (REP)
 * e chega ao ERP pela rede ou por AFD (pendrive). Constantes compartilhadas entre servidor e cliente.
 */

/** Orientação única para qualquer tentativa de registrar ponto pelo ERP. */
export const PONTO_SO_NO_RELOGIO =
  "O ponto é registrado no relógio oficial (REP) da empresa, não pelo ERP. Para corrigir ou justificar uma marcação, registre uma ocorrência de ajuste em Meu perfil para análise do RH.";

/**
 * P7-02: rotas de registro de ponto que existiam até a F0a e foram REMOVIDAS do router na F0c.
 * Quem ainda chamar recebe 403 com `PONTO_SO_NO_RELOGIO` (ver errorFormatter em server/_core/trpc.ts),
 * sem gravar nada, nem auditoria (não há como inflar o log por elas).
 */
export const ROTAS_PONTO_REMOVIDAS = ["rh.registrarPonto", "perfil.registrarPonto"] as const;

/**
 * Origens de marcação. "GPS", "Rede local" e "Manual" ficam só para exibir histórico antigo;
 * nada no ERP grava mais essas origens. "Demonstração" é a origem do seed (P7-07), nunca em produção.
 */
export const ORIGENS_PONTO = ["GPS", "Rede local", "Manual", "Demonstração"] as const;
export type OrigemPonto = (typeof ORIGENS_PONTO)[number];
export const ORIGEM_DEMONSTRACAO: OrigemPonto = "Demonstração";
