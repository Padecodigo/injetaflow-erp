# GitHub Actions e CI/CD

## Objetivo
Toda alteração deve passar por validações automáticas antes de chegar a `main`. Deploy deve ser rastreável por commit, ambiente e versão.

## Pipeline de Pull Request
1. Instalar dependências com lockfile.
2. Validar formatação e lint.
3. Rodar TypeScript check.
4. Rodar testes unitários e integração.
5. Validar migrations e schema.
6. Rodar scan de dependências e secrets.
7. Build do Next.js.
8. Executar E2E/smoke em Preview quando disponível.
9. Publicar artefatos, relatório e cobertura.

## Pipeline de produção
Somente `main` protegida ou tag aprovada. Executar CI novamente, aplicar migrations de forma controlada, fazer deploy, health check, smoke test e registrar release. Nunca imprimir secrets nos logs.

## Secrets
Configurar no GitHub Environments, separados para `preview`, `staging` e `production`: URL do Supabase, anon key pública quando aplicável, service role somente em jobs protegidos, URL de deploy, Sentry e chaves de integrações. Service role nunca vai para o browser.

## Supabase
Usar Supabase CLI para migrations versionadas. Pull Requests devem validar schema. Produção aplica somente migrations revisadas. Seed de desenvolvimento nunca pode conter dados reais.

## Rollback
Código: reverter deploy para commit anterior. Banco: aplicar migration de rollback ou procedimento compensatório; não apagar dados automaticamente. Toda release deve informar compatibilidade entre código antigo e schema novo.

## Ambientes protegidos
Requerer aprovação para produção. Limitar quem pode alterar secrets. Ativar branch protection, Dependabot/Renovate, secret scanning, CodeQL quando disponível e revisão de terceiros.
