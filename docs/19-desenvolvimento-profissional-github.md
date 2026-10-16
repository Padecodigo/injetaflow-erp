# Desenvolvimento profissional com Git e GitHub

## Repositório
O GitHub deve ser a fonte canônica do código. O repositório deve conter aplicação, migrations, documentação, testes, workflows e decisões arquiteturais. Segredos nunca entram no Git.

## Branches
- `main`: produção, sempre protegida.
- `develop`: integração quando o time optar por fluxo com ambiente de homologação.
- `feat/<modulo>-<descricao>`: nova funcionalidade.
- `fix/<modulo>-<descricao>`: correção.
- `chore/<descricao>`: manutenção técnica.
- `docs/<descricao>`: documentação.

Para time pequeno, pode-se trabalhar diretamente com branches curtas a partir de `main`, desde que todo código passe por PR e CI.

## Pull Request obrigatório
Cada PR deve informar problema, escopo, módulo, screenshots quando houver UI, migrations, impacto de segurança, permissões, auditoria, testes executados, riscos e plano de rollback. PR não deve misturar módulos sem justificativa.

## Proteção de main
Exigir PR aprovado, CI verde, branch atualizada, resolução de comentários e nenhuma vulnerabilidade crítica. Proibir force push e commits diretos em produção.

## Versionamento
Usar Conventional Commits. Gerar tags `vMAJOR.MINOR.PATCH`. Changelog deve destacar migrações, breaking changes, permissões e mudanças de comportamento industrial.

## Ambientes
- Preview por PR.
- Staging a partir de `develop` ou branch de release.
- Produção somente a partir de `main`/tag aprovada.
- Supabase deve possuir projetos separados para desenvolvimento, staging e produção.

## Release
1. CI verde.
2. Migration revisada e aplicada em staging.
3. Smoke test e revisão de permissões.
4. Aprovação de release.
5. Deploy.
6. Verificação de saúde, métricas e logs.
7. Rollback documentado se necessário.
