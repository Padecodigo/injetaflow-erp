# Qualidade, testes e Definition of Done

## Pirâmide de testes
- **Unitários:** regras de estado, cálculo de consumo, conversão de unidade, OEE, estoque e permissões.
- **Integração:** transações, tenant isolation, auditoria, outbox, idempotência e adaptadores.
- **Contrato:** schemas de API, eventos, EDI, balança, IoT e fiscal.
- **E2E:** login, acesso público, fluxo de apontamento, qualidade, estoque, manutenção e aprovação.
- **Visual:** dashboard desktop, tablet, mobile, tabelas, modal de registro e estados de bloqueio.

## Casos críticos
1. Visitante consulta dashboard sem conseguir criar dados.
2. Usuário sem permissão não vê dados de financeiro/configuração.
3. Usuário autenticado sem número de registro não consegue apontar.
4. Registro inválido é rejeitado no backend.
5. OP concluída rejeita novo apontamento.
6. Lote em quarentena bloqueia consumo e faturamento conforme regra.
7. Estorno não apaga evento original.
8. Usuário de tenant A não acessa dados do tenant B.
9. Reenvio com a mesma idempotency key não duplica estoque.
10. Auditoria registra antes/depois e autor da mutação.

## Segurança
Executar dependências auditadas, SAST, secrets scanning, validação de input, testes de autorização negativa, rate limiting e revisão de logs. Nunca usar produção para testes destrutivos.

## Definition of Done
Uma entrega só está pronta quando o caso de uso tem UI, API, validação, permissão, auditoria, estados de erro, testes, documentação, migração quando necessária, observabilidade e revisão de responsividade.

## Release
Rodar typecheck, lint, testes, build, migrações em staging, smoke test, revisão de permissões e plano de rollback. Registrar versão, mudanças de schema, flags e riscos conhecidos.
