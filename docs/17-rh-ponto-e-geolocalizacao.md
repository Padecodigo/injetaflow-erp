# RH, ponto e jornada

## Objetivo
Permitir que a empresa administre pessoas e jornada no mesmo ERP, mantendo separação de acesso entre RH, gestores, colaborador e demais módulos.

## Ponto pelo celular
O funcionário pode registrar entrada, saída e intervalos pelo app/web mobile, com autenticação, dispositivo, timestamp, fuso, status de sincronização e evidência configurada pela empresa.

## Localização
GPS e geofencing devem ser opcionais, transparentes e parametrizáveis por empresa. O sistema deve informar finalidade, solicitar consentimento quando aplicável, limitar precisão/retencão, permitir justificativa manual e preservar privacidade. Não coletar localização contínua quando basta validar o instante do ponto.

## Rede local
Como alternativa, o ponto pode ser permitido somente quando o dispositivo estiver na rede autorizada da unidade, usando gateway local ou validação de faixa/rede definida. Não confiar somente em IP enviado pelo navegador; validar no gateway e registrar evidência.

## Fluxo
1. Colaborador autentica.
2. Sistema verifica vínculo, escala, janela e dispositivo.
3. Sistema verifica regra de localização/rede da unidade.
4. Ponto é gravado como `PENDENTE`, `VALIDADO` ou `DIVERGENTE`.
5. Gestor aprova exceções com motivo.
6. RH fecha período, exporta e mantém histórico.

## Regras
- Não alterar ponto original; correções geram ajuste com motivo, autor e aprovação.
- GPS desligado não deve ser tratado automaticamente como fraude; deve gerar divergência conforme política.
- Dados de localização têm acesso restrito e prazo de retenção próprio.
- RH/saúde ocupacional não devem expor dados médicos a gestores sem necessidade.
- Fechamento de período bloqueia alterações comuns e exige fluxo de reabertura.

## Entidades
`employees`, `employment_contracts`, `departments`, `positions`, `work_schedules`, `time_entries`, `time_entry_evidences`, `geofences`, `local_gateways`, `attendance_adjustments`, `leave_records`, `training_records`, `employee_documents`.
