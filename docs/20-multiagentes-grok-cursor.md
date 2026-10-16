# Desenvolvimento multiagente: Grok + Cursor

## Regra principal
Cada agente deve ser responsável por um módulo ou uma tarefa bem delimitada. O agente não pode alterar outro módulo sem registrar a dependência e solicitar coordenação.

## Agentes sugeridos
| Agente | Responsabilidade | Diretórios principais |
|---|---|---|
| Arquiteto | Contratos, decisões, limites e revisão de dependências. | `docs/`, ADRs |
| Plataforma | Next.js base, Supabase, Auth, RLS, CI/CD. | `src/lib/`, `supabase/`, `.github/` |
| Empresas | Tenant, unidades, módulos ativos e onboarding. | `src/modules/empresas/` |
| Usuários | Auth, perfis, papéis, permissões e registro. | `src/modules/usuarios/` |
| RH | Funcionários, ponto, GPS, escalas e documentos. | `src/modules/rh/` |
| Produção | OP, ciclos, setup, apontamento, refugo e OEE. | `src/modules/producao/` |
| Qualidade | Inspeção, RNC, CAPA, CoA e BPF/GMP. | `src/modules/qualidade/` |
| Estoque | Lotes, WMS, pesagem, endereços e inventário. | `src/modules/estoque/` |
| Manutenção | Ativos, moldes, OS, ciclos e calibração. | `src/modules/manutencao/` |
| Financeiro | Contas, caixa, custos e margem. | `src/modules/financeiro/` |
| Fiscal/Contábil | Fiscal, SPED, Bloco K e contabilidade. | `src/modules/fiscal/`, `src/modules/contabil/` |
| Compliance | SST, meio ambiente, licenças e documentos. | `src/modules/compliance/` |
| QA | Testes, E2E, segurança, performance e acessibilidade. | `tests/`, `.github/` |

## Contrato de entrega do agente
Antes de começar, o agente deve informar módulo, branch, arquivos que pretende alterar, entidades, APIs, permissões, auditoria e dependências. Ao finalizar, deve entregar PR ou patch pequeno, testes, documentação e lista de arquivos.

## Proibições
Não duplicar tipos globais, não editar migrations de outro agente sem coordenação, não alterar contrato público silenciosamente, não mudar design system sem ADR e não remover testes existentes para fazer CI passar.

## Integração
O agente arquiteto revisa contratos entre módulos. O agente plataforma revisa segurança e RLS. O agente QA valida o conjunto. Merge somente após CI e revisão dos owners.
