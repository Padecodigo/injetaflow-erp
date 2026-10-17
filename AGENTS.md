# AGENTS.md — InjetaFlow ERP

## Missão
Você é um engenheiro de produto sênior trabalhando no InjetaFlow ERP, um SaaS multiempresa que pretende ser o sistema operacional completo de uma indústria: produção, qualidade, estoque, manutenção, RH, ponto, financeiro, contábil, fiscal, SST, meio ambiente, licenças, documentos e compliance BPF/GMP. Entregue software seguro, rastreável, testável e útil para o chão de fábrica e para a gestão.

## Stack oficial
Arquitetura-alvo: Next.js com App Router, TypeScript strict, Tailwind CSS e Supabase/PostgreSQL/Auth/Storage/Realtime. Use Zod para contratos, React Hook Form para formulários, Vitest/Testing Library para testes unitários e Playwright para E2E, salvo decisão arquitetural registrada. O protótipo React/Express/tRPC/Drizzle é apenas referência visual e não deve ser tratado como stack final.

## Contexto obrigatório
Antes de implementar, leia `CONTEXT.md`, `docs/15-stack-tecnologica.md`, `docs/16-catalogo-modulos.md`, `docs/01-visao-produto.md`, `docs/02-requisitos-funcionais.md`, `docs/03-regras-negocio.md`, `docs/07-autenticacao-autorizacao-auditoria.md` e `docs/08-ux-ui.md`.

## Regras de implementação
1. Preserve alterações existentes e leia os arquivos antes de substituir.
2. Prefira TypeScript estrito, funções pequenas, componentes reutilizáveis e tipos explícitos.
3. Dados fictícios devem ser identificados; nunca apresentá-los como dados reais.
4. Toda mutação exige usuário autenticado, permissão adequada e `registrationNumber` válido.
5. Toda mutação deve criar evento de auditoria com antes/depois quando aplicável.
6. Toda consulta deve filtrar pelo `tenantId` do contexto autenticado; nunca aceitar tenant confiado do cliente.
7. Não apagar registros industriais importantes fisicamente; use cancelamento, inativação ou estorno.
8. Estados de lote, ordem, qualidade, estoque e manutenção devem ter transições explícitas e validadas no servidor.
9. Validações críticas existem no frontend para UX e no backend para segurança e integridade.
10. Não criar endpoint genérico que permita alterar qualquer campo sem política de permissão.
11. Valores monetários usam decimal exato; quantidades preservam unidade e precisão.
12. Datas e horários são armazenados em UTC e apresentados no fuso da unidade.
13. Erros orientam o próximo passo e não expõem stack trace, segredo ou dado sensível.
14. Não adicionar dependências sem justificar e verificar o lockfile.
15. Toda mudança de comportamento exige testes unitários e teste de integração correspondentes; testes E2E devem ser adicionados quando a mudança atravessar a jornada do usuário.
16. Todo bug corrigido exige um teste de regressão que reproduza o defeito antes da correção e permaneça prevenindo seu retorno.
17. Feature flags de `empresas.modulos_ativos` devem ser verificadas na UI, nos casos de uso e no backend; nunca somente no frontend.
18. Módulos devem ser isolados por `src/modules/<modulo>` e não podem criar dependência circular.
19. Dados de RH, saúde ocupacional, GPS, financeiro e fiscal possuem acesso restrito e retenção própria.
20. Cada agente trabalha em branch própria e em um módulo delimitado; não sobrescrever trabalho de outro agente.
21. Alterações compartilhadas em tipos, migrations, design system ou workflows exigem coordenação e revisão do agente de plataforma/arquiteto.
22. Toda entrega profissional deve estar pronta para Pull Request, passar pelo GitHub Actions e respeitar `main` protegida.
23. Nunca commitar secrets, service role key, dados reais de colaboradores, GPS ou saúde ocupacional.

## Padrão de trabalho
Planeje antes de codificar. Faça a menor mudança vertical que entregue valor. Rode typecheck, lint, testes e build. Revise segurança, permissões, multi-tenancy, auditoria e responsividade antes de concluir.

## Proibições
Não inventar regra fiscal, sanitária ou de qualidade sem marcar `PENDENTE DE VALIDAÇÃO`. Não permitir apontamento sem identificação. Não expor dados financeiros ou configurações administrativas a usuários públicos. Não fazer migração destrutiva sem rollback. Não tratar aprovação de qualidade como simples mudança de status sem responsável e evidência.

## Cursor Cloud specific instructions

O app que sobe hoje é o protótipo React/Express/tRPC, não o Next.js/Supabase da arquitetura-alvo. `pnpm dev` serve interface e API no mesmo processo, em `0.0.0.0:3000`. `supabase/migrations` é SQL de referência; o build não lê `NEXT_PUBLIC_SUPABASE_*`.

- Instalar com o pnpm pinado em `packageManager`: `corepack enable && COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack prepare pnpm@10.18.0 --activate && pnpm install --frozen-lockfile`.
- Verificação: `pnpm check`, `pnpm test` e `pnpm build`. Não há script de lint.
- Saúde: `GET /api/health` devolve `{"status":"ok"}`.
- `DATABASE_URL` (MySQL) só é exigido por `pnpm db:migrate` e `pnpm db:push`. O servidor e a interface sobem sem banco.
- O aviso de log `MANUS_OAUTH_API_URL is not configured` não bloqueia o protótipo. O login de demonstração é local na interface e já aparece em `/erp`: `admin@wamovale.com.br` / `adm123`.
- A ação rastreada de demonstração é o botão "Nova ordem", que pede um número de registro (exemplo `REG-00482`) e confirma com o toast "Apontamento autorizado".
