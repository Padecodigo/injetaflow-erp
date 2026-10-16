# DECISIONS.md — Registro de decisões

## ADR-0001 — Monólito modular inicial
**Status:** aceita. **Data:** 2026-10-16.

O produto começa como monólito modular para acelerar o MVP, reduzir operação e manter transações de produção/estoque simples. Eventos internos e adaptadores devem preservar uma possível extração futura.

## ADR-0002 — Acesso público somente leitura
**Status:** aceita. **Data:** 2026-10-16.

O dashboard e parte da operação podem ser consultados publicamente. Qualquer mutação exige autenticação, permissão e número de registro. Financeiro e configurações não revelam dados a visitantes.

## ADR-0003 — Auditoria append-only
**Status:** aceita. **Data:** 2026-10-16.

Eventos industriais e administrativos não devem ser apagados ou sobrescritos. Correções usam novo evento com referência ao original, motivo e operador.

## ADR-0004 — Número de registro além do login
**Status:** aceita. **Data:** 2026-10-16.

O login identifica a pessoa, mas o número de registro identifica a ação operacional, especialmente em terminais compartilhados. O registro deve ser validado no servidor.

## ADR-0005 — Fiscal parametrizado e validado externamente
**Status:** aceita. **Data:** 2026-10-16.

Bloco K, SPED, ST e regras fiscais não serão tratados como verdades genéricas. Parâmetros terão vigência e deverão ser validados por especialista fiscal antes da produção.

## Como registrar nova decisão
Use `docs/13-template-adr.md`, atribua número sequencial e atualize este arquivo com o resumo e o link para o ADR detalhado.
