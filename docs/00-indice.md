# Documentação do InjetaFlow ERP

Esta pasta contém a documentação de produto, domínio, UX, arquitetura e engenharia do InjetaFlow ERP, uma plataforma SaaS para indústrias de injeção plástica.

## Como usar no Cursor

1. Leia `AGENTS.md` na raiz antes de alterar o código.
2. Consulte `.cursor/rules/` para as regras permanentes de desenvolvimento assistido por IA.
3. Use `docs/11-prompt-mestre-cursor.md` para iniciar uma nova sessão de implementação.
4. Antes de criar um módulo, leia `docs/02-requisitos-funcionais.md`, `docs/03-regras-negocio.md` e `docs/07-autenticacao-autorizacao-auditoria.md`.
5. Antes de alterar dados ou API, leia `docs/04-arquitetura-tecnica.md` e `docs/05-modelo-dados.md`.

## Documentos

| Documento | Finalidade |
|---|---|
| `01-visao-produto.md` | Visão, personas, proposta de valor e escopo do produto. |
| `02-requisitos-funcionais.md` | Requisitos funcionais por módulo e critérios de aceite. |
| `03-regras-negocio.md` | Regras industriais, operacionais, fiscais e de rastreabilidade. |
| `04-arquitetura-tecnica.md` | Arquitetura frontend, backend, dados, filas e multi-tenancy. |
| `05-modelo-dados.md` | Entidades, relacionamentos, campos obrigatórios e auditoria. |
| `06-api-e-integracoes.md` | Contratos de API, eventos, EDI, IoT, balanças e fiscal. |
| `07-autenticacao-autorizacao-auditoria.md` | Login, permissões por setor, número de registro e trilha de auditoria. |
| `08-ux-ui.md` | Sistema visual, layouts, acessibilidade e padrões de interação. |
| `09-qualidade-testes.md` | Estratégia de testes, segurança, observabilidade e Definition of Done. |
| `10-roadmap.md` | Fases de entrega e priorização do MVP. |
| `11-prompt-mestre-cursor.md` | Prompt completo para orientar o Cursor durante o desenvolvimento. |
| `12-convencoes-clean-code.md` | Convenções de código, Git, migrations e revisão. |
| `13-template-adr.md` | Modelo para registrar decisões arquiteturais. |
| `14-backlog-inicial.md` | Backlog priorizado para sair do protótipo e chegar ao produto. |
| `SKILL.md` | Skill de domínio para um agente de desenvolvimento do InjetaFlow. |

## Princípios do projeto

- **Rastreabilidade antes da velocidade:** toda mudança operacional deve identificar quem, quando, onde e por quê.
- **Chão de fábrica primeiro:** a interface deve funcionar em tablets e terminais compartilhados, com poucos cliques e estados claros.
- **Dados confiáveis:** não mascarar inconsistências; bloquear, alertar ou encaminhar para aprovação.
- **Permissão mínima:** visualizar não significa editar, liberar, cancelar ou aprovar.
- **SaaS multiempresa:** dados, usuários, configurações, integrações e auditorias devem respeitar o tenant.
- **Evolução incremental:** entregar módulos verticais completos, não apenas telas isoladas.
