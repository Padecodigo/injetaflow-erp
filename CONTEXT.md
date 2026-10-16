# CONTEXT.md — Contexto global do InjetaFlow

## Produto
InjetaFlow é um ERP SaaS multi-tenant para indústrias de injeção plástica. O objetivo é conectar planejamento, chão de fábrica, qualidade, estoque, manutenção e gestão financeira em um fluxo rastreável.

## Problema resolvido
Muitas operações ainda dependem de planilhas, apontamentos incompletos, controles separados de moldes e máquinas, rastreabilidade manual de lotes e pouca conexão entre custo real e produção. O InjetaFlow deve reduzir esse atrito sem criar uma interface pesada para o operador.

## Glossário rápido
- **Tenant:** empresa cliente isolada no SaaS.
- **Unidade:** fábrica ou planta pertencente ao tenant.
- **OP:** ordem de produção.
- **Apontamento:** registro de produção, parada, refugo, consumo, inspeção ou manutenção.
- **Registro do operador:** número obrigatório para rastrear quem realizou uma mutação.
- **RNC:** registro de não conformidade.
- **OEE:** disponibilidade × performance × qualidade.
- **Cavidade:** posição produtiva do molde; pode estar ativa, bloqueada ou inativa.
- **Lote:** unidade rastreável de resina, pigmento, produto ou outro material.

## Regras invioláveis
Acesso público é somente leitura. Toda mutação exige autenticação, permissão e número de registro. Toda mutação relevante gera auditoria. Lote em quarentena não deve ser consumido ou faturado quando a política exigir. Dados de tenants diferentes nunca podem se misturar.

## Fonte de verdade
Requisitos: `docs/02-requisitos-funcionais.md`. Regras: `docs/03-regras-negocio.md`. Arquitetura: `docs/04-arquitetura-tecnica.md` e `docs/ARCHITECTURE.md`. Segurança: `docs/07-autenticacao-autorizacao-auditoria.md`. UX: `docs/08-ux-ui.md`. Procedimentos: `docs/WORKFLOWS.md`.
