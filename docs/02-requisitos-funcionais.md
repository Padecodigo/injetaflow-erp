# Requisitos funcionais

## RF-01 Identidade e acesso
O sistema deve permitir acesso público somente leitura. Usuários autenticados devem possuir perfil, setor, unidade e número de registro. Tentativas de acessar módulo sem permissão devem mostrar bloqueio sem revelar dados.

## RF-02 Dashboard
Exibir OEE, produção boa, refugo, ordens ativas, ritmo por hora/turno, status de linhas, alertas de qualidade, estoque e manutenção. O dashboard deve respeitar tenant, unidade, período e permissão.

## RF-03 Produção e PCP
Permitir cadastrar produtos, fichas técnicas, injetoras, moldes, cavidades, resinas, pigmentos, operações e roteiros. Permitir criar, programar, liberar, pausar, concluir, cancelar e reprogramar OPs. Registrar quantidade boa, refugo, galha, retrabalho, consumo, ciclos, paradas, operador, máquina, molde e horário.

## RF-04 Qualidade
Permitir planos de inspeção, amostragem, inspeção visual/dimensional, laudos, certificados, quarentena, liberação, bloqueio, RNC, causa, ação corretiva e rastreabilidade direta/reversa. Bloquear faturamento quando a regra de qualidade exigir laudo aprovado.

## RF-05 Estoque e WMS
Permitir recebimento, conferência cega, pesagem, lote, validade, quarentena, bloqueio, endereçamento, transferência, inventário cíclico, separação, paletização, estorno e reclassificação de refugo/galha para moagem.

## RF-06 Manutenção e ativos
Permitir cadastro de injetoras, moldes, roscas, cilindros, periféricos, ferramentas e dispositivos. Criar OS preventiva, corretiva e preditiva. Controlar horas ligadas, ciclos reais, vida útil, desgaste, lubrificação, peças, custos, parada programada e evidências.

## RF-07 Ordens e rastreabilidade
Toda OP deve permitir navegar para produto, cliente, ficha, máquina, molde, lotes consumidos, apontamentos, inspeções, refugo, movimentações e usuários envolvidos.

## RF-08 Financeiro, fiscal e BI
Permitir contas a pagar/receber, fluxo de caixa, custo real por ordem, custo máquina/mão de obra/matéria-prima, orçamento, faturamento, relatórios, SPED/Bloco K e regras fiscais. Estas funções são restritas e devem ser configuráveis conforme legislação validada.

## RF-09 Integrações
Suportar balanças industriais, IoT de máquinas, EDI, leitor de código de barras, impressoras, fiscal, notificações e importação/exportação CSV. Cada integração deve ter logs, retentativas e status operacional.

## Critérios transversais de aceite
Toda mutação deve validar permissão e registro. Toda operação deve ser idempotente quando possível. Toda entidade deve ter tenant, unidade, criadoEm, atualizadoEm e auditoria. Falhas parciais não podem gerar consumo ou estoque duplicado.
