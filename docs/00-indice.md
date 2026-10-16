# Documentação do InjetaFlow ERP

Esta pasta contém a documentação de produto, domínio, UX, arquitetura e engenharia do InjetaFlow ERP, uma plataforma SaaS para indústrias de injeção plástica.

## Como usar no Cursor

1. Leia `AGENTS.md` na raiz antes de alterar o código.
2. Consulte `.cursor/rules/` para as regras permanentes de desenvolvimento assistido por IA.
3. Use `docs/11-prompt-mestre-cursor.md` para iniciar uma nova sessão de implementação.
4. Antes de criar um módulo, leia `docs/02-requisitos-funcionais.md`, `docs/03-regras-negocio.md` e `docs/07-autenticacao-autorizacao-auditoria.md`.
5. Antes de alterar dados ou API, leia `docs/04-arquitetura-tecnica.md` e `docs/05-modelo-dados.md`.
6. Para o projeto real, leia `docs/15-stack-tecnologica.md` e `CONTEXT.md`; o protótipo anterior usa uma stack diferente e serve apenas como referência visual.

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
| `15-stack-tecnologica.md` | Stack oficial, sistema Lego, feature flags e estrutura Next.js/Supabase. |
| `16-catalogo-modulos.md` | Catálogo corporativo completo de módulos e dependências. |
| `17-rh-ponto-e-geolocalizacao.md` | RH, ponto móvel, GPS, geofence e rede local. |
| `18-bpf-gmp-compliance.md` | BPF/GMP, sala limpa, CoA, CAPA e documentos regulatórios. |
| `19-desenvolvimento-profissional-github.md` | Branches, PRs, ambientes, releases e proteção de main. |
| `20-multiagentes-grok-cursor.md` | Divisão de responsabilidades entre agentes por módulo. |
| `21-github-actions-e-cicd.md` | Pipeline de CI/CD, secrets, migrations e rollback. |
| `22-prompt-start-grok-cursor.md` | Prompt de inicialização do projeto para cada agente. |
| `23-prompt-agente-modulo.md` | Prompt de execução por módulo com contrato de entrega. |
| `ARCHITECTURE.md` | Diagramas Mermaid, fluxo de dados e limites de módulos. |
| `WORKFLOWS.md` | Playbooks para features, endpoints, migrations e integrações. |
| `TESTING.md` | Ferramentas, convenções, fixtures e cenários de teste. |
| `DECISIONS.md` | Registro vivo das decisões arquiteturais. |
| `PROGRESS.md` | Memória de desenvolvimento e próximos passos. |
| `supabase/migrations/0001_fundacao_empresas_usuarios.sql` | Fundação SQL de empresas, módulos ativos, usuários e RLS. |
| `.github/workflows/ci.yml` | Workflow inicial de qualidade para Pull Requests e main. |
| `.github/PULL_REQUEST_TEMPLATE.md` | Checklist profissional para revisão de código. |
| `.github/CODEOWNERS.example` | Modelo de ownership por módulo. |
| `SKILL.md` | Skill de domínio para um agente de desenvolvimento do InjetaFlow. |

## Princípios do projeto

- **Rastreabilidade antes da velocidade:** toda mudança operacional deve identificar quem, quando, onde e por quê.
- **Chão de fábrica primeiro:** a interface deve funcionar em tablets e terminais compartilhados, com poucos cliques e estados claros.
- **Dados confiáveis:** não mascarar inconsistências; bloquear, alertar ou encaminhar para aprovação.
- **Permissão mínima:** visualizar não significa editar, liberar, cancelar ou aprovar.
- **SaaS multiempresa:** dados, usuários, configurações, integrações e auditorias devem respeitar o tenant.
- **Evolução incremental:** entregar módulos verticais completos, não apenas telas isoladas.
