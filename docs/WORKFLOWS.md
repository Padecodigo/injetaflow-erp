# WORKFLOWS.md — Playbooks de desenvolvimento

## Nova feature de negócio
1. Identifique módulo, ator, fluxo, estado e critérios de aceite.
2. Leia requisitos, regras, permissão, auditoria e modelo de dados.
3. Crie ou atualize tipos e estados.
4. Implemente caso de uso com validação, autorização, transação e auditoria.
5. Crie endpoint tipado e testes negativos.
6. Implemente UI com loading, vazio, erro, bloqueio e sucesso.
7. Atualize docs, backlog e prompt de uso quando necessário.
8. Crie teste unitário e teste de integração; adicione E2E se a jornada do usuário mudar.
9. Rode typecheck, todos os testes e build.

## Correção de bug
1. Reproduza o bug com um teste de regressão antes de corrigir.
2. Confirme que o teste falha pelo motivo esperado.
3. Corrija a causa, não apenas o sintoma.
4. Faça o teste de regressão passar.
5. Adicione ou atualize o teste de integração afetado.
6. Rode toda a suíte relevante e documente a causa e a proteção criada.

## Novo endpoint
1. Defina método, rota, input, output e códigos de erro.
2. Valide input na borda.
3. Resolva sessão, tenant, unidade e permissões no servidor.
4. Chame caso de uso, nunca lógica crítica diretamente no controller.
5. Use transação quando houver múltiplas escritas.
6. Gere auditoria para mutações.
7. Teste sucesso, input inválido, não autenticado, sem permissão, estado inválido e tenant incorreto.

## Nova migration
1. Descreva o motivo e impacto.
2. Atualize schema/tipos.
3. Gere migration versionada.
4. Revise índices, FKs, defaults e compatibilidade com dados existentes.
5. Teste em banco vazio e com dados representativos.
6. Documente backfill, rollback e janela de deploy.
7. Nunca remover ou renomear dados em produção sem estratégia em etapas.

## Novo componente visual
1. Verifique se já existe componente equivalente.
2. Defina estados, acessibilidade e responsividade.
3. Crie componente pequeno e reutilizável.
4. Adicione teste de interação quando houver ação.
5. Valide visualmente desktop, tablet e mobile.
6. Evite colocar regra de autorização dentro de componente puramente visual.

## Nova integração
1. Defina contrato, autenticação, timeout e limites.
2. Crie adaptador isolado do domínio.
3. Registre correlationId e status da comunicação.
4. Use retry com backoff e dead-letter quando assíncrono.
5. Faça a operação idempotente.
6. Crie health check e painel de falhas.
7. Não permitir que uma falha externa duplique estoque ou produção.

## Definition of Done
Código, teste unitário, teste de integração, teste de regressão quando aplicável, autorização, auditoria, documentação, observabilidade, estados de UI, revisão de tenant isolation, typecheck, testes e build concluídos.
