# Stack tecnológica oficial

## Decisão de referência
A arquitetura-alvo do produto é:

| Camada | Tecnologia | Uso |
|---|---|---|
| Frontend | Next.js App Router | SSR, layouts, rotas protegidas e experiência web. |
| Linguagem | TypeScript strict | Tipagem de domínio, contratos e segurança de refatoração. |
| UI | Tailwind CSS + componentes acessíveis | Design system, responsividade e velocidade de implementação. |
| Backend/Banco | Supabase | PostgreSQL, Auth, RLS, Storage, Realtime e Edge Functions quando necessário. |
| Validação | Zod | Inputs, outputs, env e contratos. |
| Formulários | React Hook Form + Zod | Formulários operacionais com validação consistente. |
| Tabelas | TanStack Table | Filtros, paginação, ordenação e virtualização. |
| Testes | Vitest + Testing Library + Playwright | Unitários, integração, componentes e E2E. |
| Observabilidade | Logs estruturados + Sentry/OpenTelemetry conforme decisão | Erros, performance e correlação. |
| Deploy | Vercel ou plataforma compatível + Supabase | A definir por custo, LGPD, região e operação. |

## Estado atual versus arquitetura-alvo
O protótipo visual existente foi inicializado em um starter React/Express/tRPC/Drizzle. Isso não invalida o design, mas não deve ser confundido com a arquitetura final. Para o produto real, a recomendação é iniciar um novo app Next.js com Supabase e migrar o design system/telas por módulo, evitando uma migração parcial confusa.

## Sistema Lego
Cada tenant possui `empresas.modulos_ativos` em JSONB. A ativação deve ser verificada em três camadas:

1. **Rota/UI:** esconder ou bloquear navegação e páginas.
2. **Aplicação:** impedir execução de casos de uso quando módulo inativo.
3. **Banco/API:** RLS e funções não devem aceitar operação de módulo desativado.

Nunca confiar apenas no frontend para feature flag. Módulos avançados podem depender de módulos-base; a ativação deve validar dependências.

## Estrutura recomendada
```text
src/
  app/                         # App Router, layouts e páginas finas
    (auth)/
    (app)/
      dashboard/
      [modulo]/
  modules/                     # Domínios isolados do ERP
    empresas/
    usuarios/
    rh/
    producao/
    qualidade/
    estoque/
    manutencao/
    financeiro/
    contabil/
    fiscal/
    saude-seguranca/
    meio-ambiente/
    documentos/
    licencas/
    sala-limpa/
    rastreabilidade/
    cep/
    laudos-coa/
  components/                  # Design system e componentes compartilhados
  lib/                         # Supabase, auth, feature flags, validação
  types/                       # Tipos compartilhados
supabase/
  migrations/
  seed.sql
  functions/
  config.toml
```

## Regra de isolamento
Um módulo deve poder ser desenvolvido, testado, ativado e desativado sem importar telas ou regras de outro módulo de forma circular. Dependências entre módulos devem ser explícitas e documentadas.
