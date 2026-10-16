# API e integrações

## Padrão de API
Usar `/api/v1`. Resposta de sucesso: `{ data, meta }`. Erro: `{ error: { code, message, details, requestId } }`. Paginação por cursor ou `page/limit` com limite máximo. Datas ISO-8601. Decimais como string quando houver risco de perda de precisão.

## Autenticação
Sessão segura com cookie HttpOnly/Secure/SameSite adequado ao ambiente ou tokens de curta duração com refresh protegido. Toda requisição protegida resolve usuário, tenant, unidade, papéis e permissões.

## Endpoints de referência
- `GET /dashboard/summary`
- `GET/POST /production-orders`
- `POST /production-orders/:id/release`
- `POST /production-orders/:id/entries`
- `POST /production-orders/:id/scrap`
- `GET/POST /quality/inspections`
- `POST /quality/lots/:id/quarantine`
- `POST /quality/lots/:id/release`
- `GET/POST /inventory/movements`
- `POST /inventory/receipts/:id/confirm`
- `GET/POST /maintenance/work-orders`
- `POST /maintenance/work-orders/:id/close`
- `GET /audit-events`

## Mutação
Toda mutação recebe `idempotencyKey`, `registrationNumber` e, quando necessário, `reason`/`evidence`. O servidor recalcula totais e valida o estado atual antes de gravar.

## Balanças
Registrar equipamento, leitura bruta, tara, líquido, unidade, estabilidade, timestamp, operador, lote e referência da operação. Não aceitar leitura manual silenciosa quando a política exigir balança.

## IoT de máquinas
Receber ciclos, temperatura, pressão, estado, horas ligadas e alarmes. Usar gateway autenticado, timestamp da máquina, deduplicação e fila de eventos. Nunca permitir que telemetria altere estoque ou status crítico sem regra explícita.

## EDI e fiscal
Mensagens devem ter versão, envelope, validação, hash/correlationId, status, retentativas e dead-letter. Fiscal e SPED precisam de adaptador versionado e validação de contador/especialista.

## Arquivos
Laudos, certificados, fotos, leituras e documentos ficam em storage privado com referência no banco, checksum, mime type, tamanho, autor, data e política de retenção.
