# TESTING.md — Estratégia de testes

## Ferramentas oficiais
Usar o runner já configurado no projeto, TypeScript para checagem estática e a ferramenta E2E escolhida pelo projeto antes de adicionar outra. Não misturar Jest, Vitest ou Cypress sem decisão registrada.

## Convenções
Testes unitários próximos ao módulo: `*.test.ts`. Integração em `tests/integration/`. E2E em `tests/e2e/`. Nomes descrevem comportamento: `production-order-release.test.ts`, não `utils2.test.ts`.

## Fixtures
Factories devem criar tenant, unidade, usuário, registro de operador, produto, material, lote, máquina, molde e OP. Toda fixture deve permitir trocar tenant e permissões para testar isolamento e autorização.

## Sempre testar
Regras de estado; quantidades e unidades; lotes e validade; idempotência; transações; auditoria; tenant isolation; acesso público; permissão negativa; registro ausente/inválido; erro 4xx/5xx; integração indisponível; acessibilidade básica; responsividade de telas críticas.

## Pode ser simplificado
Não testar implementação interna de um componente sem comportamento observável. Não criar snapshot gigante de páginas inteiras. Não usar teste visual como substituto de teste de autorização.

## Dados
Somente dados sintéticos. Relógio, aleatoriedade e rede devem ser controláveis. Testes não podem depender de ordem global ou compartilhar mutações entre casos.

## Pipeline mínimo
`pnpm check`, `pnpm test`, build, migration check, testes de contrato e smoke E2E. Falha de lint, typecheck, segurança ou isolamento bloqueia merge.
