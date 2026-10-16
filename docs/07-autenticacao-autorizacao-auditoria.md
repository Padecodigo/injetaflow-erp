# Autenticação, autorização e auditoria

## Experiência desejada
Visitantes podem consultar o dashboard público e módulos operacionais liberados para consulta. O cabeçalho mostra `Bom dia, equipe`. Depois do login, a saudação usa o nome da pessoa, por exemplo `Bom dia, João`. O sistema mostra o estado `Acesso público` ou `Registro REG-00482`.

## Login
O usuário informa identidade por provedor configurado e o sistema resolve seu cadastro, tenant, unidade, setor, perfil e número de registro. Se não houver registro ativo, o login pode consultar, mas não pode operar.

## Número de registro
O número de registro é obrigatório para qualquer apontamento ou mudança. Ele deve ser validado contra o cadastro do operador e vinculado à sessão. Para terminais compartilhados, permitir troca segura de operador e exigir novo registro.

## Matriz de acesso sugerida
| Área | Público consulta | Operador | Líder | Especialista | Admin |
|---|---:|---:|---:|---:|---:|
| Dashboard | Sim | Sim | Sim | Sim | Sim |
| Produção | Sim | Aponta | Aprova/corrige | Configura | Sim |
| Qualidade | Consulta limitada | Inspeciona | Trata RNC | Libera/bloqueia | Sim |
| Estoque | Consulta limitada | Movimenta | Ajusta com motivo | Configura | Sim |
| Manutenção | Consulta limitada | Executa OS | Planeja | Configura ativos | Sim |
| Financeiro | Não | Não | Não | Consulta | Controla |
| Configurações | Não | Não | Não | Por escopo | Total |

## Permissões atômicas
Exemplos: `production.entry.create`, `production.entry.correct`, `quality.lot.release`, `quality.rnc.close`, `inventory.movement.create`, `inventory.adjustment.approve`, `maintenance.work_order.close`, `finance.read`, `finance.export`, `admin.permission.manage`.

## Auditoria obrigatória
Gravar login, logout, falha de login, consulta sensível, criação, edição, aprovação, liberação, bloqueio, cancelamento, estorno, exportação, alteração de permissão, alteração fiscal e integração. Auditoria deve ser append-only para usuários comuns.

## Correções
Correção de apontamento exige motivo, referência ao evento original, novo número de registro e usuário autorizado. Nunca sobrescrever o valor original sem preservar o antes/depois.

## Segurança
Aplicar MFA para perfis críticos, expiração de sessão, revogação, rate limit, proteção CSRF, headers seguros, validação de upload, segregação de tenant e revisão periódica de permissões.
