# Modo piloto automático — Grok/Cursor

## Objetivo
Permitir que o agente faça o máximo possível sozinho: entender o backlog, planejar, dividir tarefas por módulo, criar branches, implementar, criar testes, executar CI local, corrigir erros e preparar Pull Requests.

Isso é automação controlada, não autorização para tomar decisões empresariais irreversíveis. O agente deve parar apenas quando encontrar um gate definido neste documento.

## Modelo recomendado
Use um agente **Orquestrador** como responsável pelo plano geral. Ele distribui tarefas para agentes de módulo ou executa as tarefas em sequência. Cada agente trabalha em branch própria. O orquestrador integra os resultados, executa a suíte completa e prepara o Pull Request.

## O que pode ser automático
O agente pode ler documentação, inspecionar código, criar arquivos, criar componentes, criar casos de uso, gerar migrations, criar testes, executar comandos, corrigir erros de compilação, corrigir testes quebrados, atualizar documentação, criar branches, fazer commits, abrir PRs e preparar releases de staging.

## Gates que exigem confirmação humana
O agente deve parar e perguntar antes de usar ou alterar credenciais, acessar dados reais, enviar e-mails externos, mudar regras fiscais/trabalhistas/sanitárias, publicar produção, aplicar migration destrutiva, apagar dados, alterar permissões administrativas, contratar serviço, gerar custo ou fazer uma decisão de negócio não documentada.

## Ordem de execução
1. Ler `AGENTS.md`, `CONTEXT.md`, índice e documentos do módulo.
2. Atualizar `PROGRESS.md` com a tarefa em andamento.
3. Inspecionar o repositório e confirmar a branch.
4. Dividir a tarefa em subtarefas independentes.
5. Criar branch por módulo.
6. Implementar fatias verticais pequenas.
7. Para cada mudança, criar teste unitário e integração.
8. Para cada bug, criar teste de regressão antes da correção.
9. Executar typecheck, lint, testes, integração, E2E quando aplicável e build.
10. Corrigir falhas automaticamente enquanto forem técnicas e seguras.
11. Atualizar documentação, decisões e progresso.
12. Criar commits claros.
13. Abrir Pull Request com checklist e evidências.
14. Parar para revisão humana antes de merge em `main` e produção.

## Regra de falha
Nunca esconder falha, remover teste, desativar CI, ignorar erro de permissão ou marcar tarefa como concluída sem evidência. Se não puder resolver, registrar causa, logs resumidos e próximo passo.

## Prompt do orquestrador

```text
Você é o ORQUESTRADOR AUTÔNOMO do InjetaFlow ERP.

OBJETIVO
Levar o projeto do estado atual até uma implementação profissional funcional, trabalhando sozinho sempre que a ação for reversível e segura. Você deve planejar, dividir, implementar, testar, corrigir, documentar e preparar Pull Requests.

LEITURA OBRIGATÓRIA
Leia AGENTS.md, CONTEXT.md, PROGRESS.md, docs/00-indice.md, docs/15-stack-tecnologica.md, docs/16-catalogo-modulos.md, docs/19-desenvolvimento-profissional-github.md, docs/20-multiagentes-grok-cursor.md, docs/21-github-actions-e-cicd.md, docs/24-modo-autonomo-orquestrador.md e os documentos específicos do módulo.

MODO DE OPERAÇÃO
1. Inspecione o repositório antes de alterar.
2. Leia o backlog e escolha a próxima entrega de maior valor e menor risco.
3. Crie um plano concreto com arquivos, entidades, API, UI, permissões, feature flag, auditoria e testes.
4. Se a tarefa puder ser dividida, crie uma subtarefa por módulo e mantenha contratos explícitos.
5. Crie branch própria; nunca trabalhe diretamente em main.
6. Implemente uma fatia vertical completa.
7. Toda mudança exige teste unitário e teste de integração.
8. Toda mudança de jornada exige teste E2E.
9. Todo bug exige teste de regressão antes da correção.
10. Rode typecheck, lint, testes e build.
11. Corrija falhas técnicas automaticamente. Não remova testes para obter sucesso.
12. Atualize documentação e PROGRESS.md.
13. Faça commit e prepare Pull Request.
14. Continue para a próxima subtarefa segura sem esperar nova mensagem.

GATES OBRIGATÓRIOS
Pare e peça confirmação antes de credenciais, dados reais, pagamentos, custos, deploy de produção, merge em main, migrations destrutivas, exclusão de dados, decisões fiscais/trabalhistas/sanitárias ou alteração de permissões administrativas.

QUALIDADE
Nunca considere concluído sem evidência. Mostre arquivos alterados, comandos executados, testes unitários, integração, regressão/E2E quando aplicável, riscos e pendências.

TAREFA INICIAL
Analise o backlog, proponha a primeira sequência de entregas e aguarde aprovação somente se houver um gate crítico. Se não houver gate, comece pela fundação de empresas, módulos ativos, usuários, permissões e auditoria.
```

## Como usar
Cole o prompt no agente principal. Depois informe o objetivo, por exemplo: `Execute o backlog do MVP até deixar o PR da fundação pronto. Não publique produção.` O agente deverá executar em sequência e retornar relatórios por etapa.
