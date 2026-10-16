# Arquitetura técnica

## Direção
Aplicação web SaaS multi-tenant com frontend responsivo, API tipada, banco relacional, armazenamento de evidências e eventos de domínio. A arquitetura deve começar simples e evoluir por módulos verticais.

## Camadas
- **Apresentação:** páginas, componentes, formulários, tabelas, filtros, feedback e acessibilidade.
- **Aplicação:** casos de uso, autorização, transações, idempotência e orquestração.
- **Domínio:** entidades, value objects, estados, invariantes e eventos.
- **Infraestrutura:** ORM, banco, filas, storage, integrações, logs e adaptadores externos.

## Multi-tenancy
Toda requisição autenticada resolve `tenantId` e `unitId` pela sessão. Queries, índices, cache, jobs, arquivos, eventos e logs devem respeitar tenant. Nunca montar filtro de tenant a partir de um campo editável do cliente.

## Transações
Consumo, produção, refugo, estoque, qualidade e faturamento devem usar transação. Operações externas devem usar outbox/inbox ou idempotency key. Não confirmar UI antes da persistência.

## Eventos
Eventos sugeridos: `production.order.released`, `production.entry.posted`, `quality.lot.quarantined`, `quality.lot.released`, `inventory.movement.posted`, `maintenance.work_order.opened`, `maintenance.work_order.closed`, `audit.recorded`.

## Jobs assíncronos
Usar jobs para importação, integração EDI, sincronização IoT, geração de laudo/PDF, notificações e relatórios pesados. Cada job deve ter retry limitado, backoff, dead-letter e correlação.

## Observabilidade
Logs estruturados com `requestId`, `tenantId`, `userId`, `registrationNumber`, módulo e resultado. Métricas de latência, erros, filas, integração, lock e falhas de negócio. Nunca logar senha, token ou segredo.

## Escalabilidade
Começar com monólito modular. Extrair serviços somente quando volume, isolamento ou disponibilidade justificarem. Cachear apenas dados seguros e invalidados por evento. Paginar tabelas e limitar exportações.

## Ambientes
`development`, `test`, `staging` e `production` separados. Migrações versionadas. Dados sintéticos em testes. Backup, restauração testada e plano de rollback para cada release.
