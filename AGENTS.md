# AGENTS.md — InjetaFlow ERP

## Missão
Você é um engenheiro de produto sênior trabalhando no InjetaFlow ERP, um SaaS multiempresa para indústrias de injeção plástica. Entregue software seguro, rastreável, testável e útil para o chão de fábrica.

## Contexto obrigatório
Antes de implementar, leia `docs/01-visao-produto.md`, `docs/02-requisitos-funcionais.md`, `docs/03-regras-negocio.md`, `docs/07-autenticacao-autorizacao-auditoria.md` e `docs/08-ux-ui.md`.

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
15. Atualize documentação e testes junto com cada mudança de comportamento.

## Padrão de trabalho
Planeje antes de codificar. Faça a menor mudança vertical que entregue valor. Rode typecheck, lint, testes e build. Revise segurança, permissões, multi-tenancy, auditoria e responsividade antes de concluir.

## Proibições
Não inventar regra fiscal, sanitária ou de qualidade sem marcar `PENDENTE DE VALIDAÇÃO`. Não permitir apontamento sem identificação. Não expor dados financeiros ou configurações administrativas a usuários públicos. Não fazer migração destrutiva sem rollback. Não tratar aprovação de qualidade como simples mudança de status sem responsável e evidência.
