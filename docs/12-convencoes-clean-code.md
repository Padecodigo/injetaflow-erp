# Convenções profissionais e Clean Code

## Nomenclatura
Código em inglês quando alinhado à biblioteca/framework; domínio e textos de negócio em português do Brasil quando isso melhorar entendimento. Use nomes de negócio explícitos: `productionOrder`, `registrationNumber`, `qualityLot`, `auditEvent`. Evite `data`, `info`, `misc`, `handleEverything`.

## Funções e componentes
Uma função deve ter uma responsabilidade principal. Componentes de página orquestram; componentes de domínio exibem e disparam intenção; casos de uso aplicam regras. Evite componentes monolíticos, efeitos escondidos e prop drilling excessivo.

## Erros
Erros de negócio devem possuir código estável, mensagem humana e detalhes seguros. Diferencie validação, permissão, conflito de estado, indisponibilidade externa e erro inesperado.

## Tipos
Não usar `any` sem justificativa. Preferir unions/enums para estados. Validar fronteiras com schema. Não usar casts para silenciar erro real.

## Banco e migrações
Toda mudança de schema precisa de migration, revisão de índice, impacto de dados, compatibilidade reversa e plano de rollback. Nunca renomear ou remover coluna em uma única etapa quando houver dados em produção.

## Git
Commits pequenos e imperativos: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`. Um commit deve representar uma intenção. Pull request deve conter contexto, screenshots quando UI, testes, riscos, migração e plano de rollback.

## Code review
Revisar corretude, segurança, tenant isolation, autorização, auditoria, performance, acessibilidade, estados de erro, testes e manutenção. Não aprovar apenas porque compila.
