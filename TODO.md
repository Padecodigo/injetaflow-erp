# TODO — InjetaFlow ERP

## Shell do ERP e navegação
- [x] Criar uma shell moderna com sidebar, marca InjetaFlow, busca global, seletor de unidade, notificações, avatar e navegação responsiva.
- [x] Disponibilizar rotas navegáveis para Dashboard, Produção, Qualidade, Estoque, Manutenção, Ordens, Financeiro e Configurações.
- [x] Exibir estado ativo da navegação e manter a hierarquia visual coerente entre módulos.
- [x] Permitir consulta pública do painel, sinalizar módulos restritos com cadeado e abrir login ao tentar acessá-los.

## Identidade e rastreabilidade
- [x] Exibir “Bom dia, equipe” para visitantes públicos e personalizar a saudação após login com o nome do usuário.
- [x] Solicitar nome e número de registro no login para identificar o operador da sessão.
- [x] Solicitar/confirmar número de registro antes de qualquer apontamento, criação ou alteração, deixando explícito que a ação será gravada no histórico.
- [ ] Conectar autenticação real, papéis, permissões por setor e trilha de auditoria ao backend.

## Dashboard operacional
- [x] Exibir KPIs de OEE, produção do dia, refugo e ordens em andamento com variação percentual.
- [x] Exibir gráfico de produção por turno, agenda de ordens de produção e alertas de qualidade/manutenção.
- [x] Demonstrar status de linhas/injetoras e progresso por ordem com dados de exemplo.

## Módulos operacionais
- [x] Produção: mostrar fila de ordens, máquina, molde, produto, quantidade, progresso e status.
- [x] Qualidade: mostrar lotes em inspeção/quarentena, taxa de aprovação e não conformidades.
- [x] Estoque: mostrar resinas, pigmentos, embalagens, lotes, validade, localização e nível de estoque.
- [x] Manutenção: mostrar ativos, saúde, ciclos, ordens corretivas/preventivas e próxima parada.
- [x] Ordens: mostrar visão geral de ordens de produção, filtros de status e ação de nova ordem.
- [x] Financeiro: mostrar receita, custos, margem, fluxo de caixa e contas a receber.
- [x] Configurações: mostrar cards de integrações, usuários, regras de qualidade, dispositivos e dados mestres.

## Qualidade de entrega
- [x] Aplicar direção visual industrial neo-utility com teal elétrico, status semânticos, tipografia Inter e responsividade.
- [x] Criar manifesto `manus-routes.json` sincronizado com as rotas implementadas.
- [ ] Conectar os componentes a banco de dados e APIs reais em uma próxima etapa.
- [ ] Adicionar autenticação, permissões por papel e auditoria persistida em uma próxima etapa.
