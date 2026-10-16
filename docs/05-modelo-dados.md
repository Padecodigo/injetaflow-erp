# Modelo de dados

## Convenções
Todas as tabelas de negócio devem possuir `id`, `tenant_id`, `unit_id` quando aplicável, `created_at`, `updated_at`, `created_by`, `updated_by`, `version` e `status`. Use UUID ou bigint consistente. Soft delete apenas para cadastros; documentos industriais usam cancelamento/estorno.

## Identidade
`tenants`, `units`, `users`, `roles`, `permissions`, `user_roles`, `user_units`, `operator_registrations`, `sessions`.

## Cadastros industriais
`products`, `product_versions`, `materials`, `material_lots`, `material_types`, `machines`, `machine_components`, `molds`, `mold_cavities`, `tools`, `work_centers`, `customers`, `suppliers`, `warehouses`, `locations`, `uoms`.

## Engenharia e produção
`bom_headers`, `bom_items`, `routing_headers`, `routing_operations`, `production_orders`, `production_order_items`, `production_schedules`, `production_entries`, `downtime_entries`, `scrap_entries`, `setup_entries`, `machine_cycles`, `shift_calendars`.

## Qualidade
`inspection_plans`, `inspection_plan_items`, `inspection_orders`, `inspection_results`, `quality_lots`, `quality_releases`, `non_conformities`, `corrective_actions`, `quality_documents`, `quarantine_records`.

## Estoque
`inventory_balances`, `inventory_movements`, `inventory_movement_items`, `receipts`, `receipt_items`, `picking_orders`, `picking_items`, `pallets`, `weighings`, `cycle_counts`, `stock_reservations`.

## Manutenção
`assets`, `maintenance_plans`, `maintenance_triggers`, `work_orders`, `work_order_tasks`, `work_order_parts`, `maintenance_readings`, `lubrication_records`, `downtime_plans`.

## Gestão
`cost_centers`, `cost_entries`, `budgets`, `accounts_receivable`, `accounts_payable`, `cash_flow_entries`, `invoices`, `tax_rules`, `fiscal_documents`, `edi_messages`, `integration_connections`.

## Auditoria
`audit_events` deve registrar `id`, `tenant_id`, `unit_id`, `actor_user_id`, `registration_number`, `action`, `entity_type`, `entity_id`, `before_json`, `after_json`, `reason`, `request_id`, `ip_hash`, `created_at`.

## Índices mínimos
Criar índices compostos por `(tenant_id, unit_id, status)`, `(tenant_id, code)`, `(tenant_id, lot_number)`, `(tenant_id, created_at)`, além de índices específicos para OP, lote, máquina, molde e auditoria.

## Integridade
FKs quando possível; unique por tenant; check de quantidades não negativas; decimal para valores; enum/status controlados; optimistic locking com `version`; constraints para origem/destino de movimentação.
