# ARCHITECTURE.md — Arquitetura do InjetaFlow

## Estilo arquitetural
Começar com monólito modular e evoluir por evidência. Organizar por domínio de negócio, mantendo apresentação, aplicação, domínio e infraestrutura separados dentro de cada módulo.

## Fluxo de uma mutação
```mermaid
flowchart LR
  UI[Terminal / Web / Tablet] --> Session[Contexto de sessão]
  Session --> API[API tipada]
  API --> Auth[Autorização]
  Auth --> UseCase[Caso de uso]
  UseCase --> Rules[Invariantes do domínio]
  Rules --> Tx[Transação]
  Tx --> DB[(Banco relacional)]
  Tx --> Audit[(Auditoria append-only)]
  Tx --> Outbox[(Outbox de eventos)]
  Outbox --> Jobs[Jobs e integrações]
```

## Fluxo de rastreabilidade
```mermaid
flowchart LR
  Resin[Resina / pigmento / lote] --> Receipt[Recebimento e qualidade]
  Receipt --> Stock[Estoque por lote]
  Stock --> OP[Ordem de produção]
  Mold[Molde + cavidades] --> OP
  Machine[Injetora] --> OP
  OP --> Entry[Apontamento]
  Entry --> Inspection[Inspeção e laudo]
  Inspection --> Finished[Produto acabado]
  Finished --> Shipment[Expedição / faturamento]
  Entry --> Audit[Auditoria com operador]
```

## Limites dos módulos
`identity`: tenant, unidade, usuário, sessão, papéis e registro. `production`: OP, ciclos, setup, produção, refugo e paradas. `quality`: inspeções, quarentena, laudo, RNC e liberação. `inventory`: recebimento, lote, estoque, WMS, pesagem e movimentações. `maintenance`: ativos, moldes, OS, ciclos, peças e paradas. `finance`: custo, faturamento, contas, fluxo e fiscal. `integrations`: IoT, balanças, EDI, leitores e fiscal. `audit`: eventos imutáveis.

## Estrutura recomendada
```text
src/
  modules/
    identity/
    production/
    quality/
    inventory/
    maintenance/
    finance/
    integrations/
    audit/
  shared/
    auth/
    database/
    errors/
    observability/
  ui/
    components/
    layouts/
    pages/
```

## Decisão importante
Não extrair microserviços no início. Use eventos internos e adaptadores bem definidos. Extrair somente quando houver necessidade comprovada de escala, isolamento ou disponibilidade independente.
