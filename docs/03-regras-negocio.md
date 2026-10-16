# Regras de negócio

## Identidade e auditoria
1. Consultas públicas nunca criam dados.
2. Apontamento, edição, liberação, bloqueio, cancelamento, estorno e aprovação exigem sessão autorizada e número de registro.
3. O número de registro identifica a ação; não substitui autenticação.
4. Usuário não pode alterar o próprio histórico de auditoria.
5. Uma ação aprovada não deve ser editada silenciosamente; deve gerar correção ou estorno com motivo.

## Produção
1. OP liberada precisa de produto, ficha técnica, quantidade, unidade, roteiro, máquina ou recurso planejado e janela.
2. Quantidade boa + refugo + retrabalho deve ser compatível com ciclos, cavidades ativas e conversão da ficha.
3. Cavidades bloqueadas não geram produção planejada e devem impactar capacidade.
4. Troca de cor, molde ou material exige setup registrado.
5. Consumo real divergente do previsto acima do limite parametrizado exige justificativa/aprovação.
6. OP concluída não aceita novos apontamentos sem reabertura autorizada.

## Qualidade
1. Lote em quarentena não pode ser consumido, separado ou faturado, salvo fluxo autorizado.
2. Produto sem laudo exigido não pode ser liberado.
3. Liberação registra responsável, data, plano de inspeção, resultados e evidências.
4. RNC deve possuir severidade, causa, contenção, responsável, prazo e verificação de eficácia.
5. Rastreabilidade deve funcionar resina/pigmento → OP → máquina/molde → produto acabado → expedição.

## Estoque
1. Saldo nunca pode ficar negativo, exceto política explícita aprovada pelo tenant.
2. Lote, validade e unidade são obrigatórios para insumos controlados.
3. Movimentações usam dupla partida lógica: origem e destino ou consumo e entrada de produção.
4. Peso informado por balança deve preservar tara, peso bruto, peso líquido, equipamento e operador.
5. Estorno referencia a movimentação original e não apaga o evento anterior.
6. Refugo e galha só viram material de moagem após classificação, pesagem e registro.

## Manutenção
1. Preventiva pode ser disparada por data, horas ligadas, ciclos ou condição IoT.
2. Máquina em manutenção não deve ser programada sem override autorizado.
3. OS encerrada deve informar causa, serviço executado, peças, horas, responsável e evidências.
4. Molde deve manter histórico por número de ciclos e cavidades.

## Financeiro e fiscal
Regras tributárias, SPED, Bloco K, ST e emissão fiscal devem ser validadas por especialista fiscal brasileiro antes de produção. A aplicação deve versionar parâmetros por vigência e nunca sobrescrever histórico.

## Status recomendados
OP: `RASCUNHO`, `PLANEJADA`, `LIBERADA`, `EM_SETUP`, `EM_PRODUCAO`, `PAUSADA`, `CONCLUIDA`, `CANCELADA`.
Lote: `RECEBIDO`, `QUARENTENA`, `APROVADO`, `BLOQUEADO`, `CONSUMIDO`, `EXPEDIDO`.
Inspeção: `PENDENTE`, `EM_ANALISE`, `APROVADA`, `REPROVADA`, `CANCELADA`.
OS: `ABERTA`, `PLANEJADA`, `EM_EXECUCAO`, `AGUARDANDO_PECA`, `CONCLUIDA`, `CANCELADA`.
