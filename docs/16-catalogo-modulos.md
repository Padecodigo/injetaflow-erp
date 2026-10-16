# Catálogo de módulos do ERP

O InjetaFlow deve ser uma plataforma única, mas não um bloco monolítico de funcionalidades. Cada módulo é ativável por tenant, possui permissões próprias, menu próprio, entidades próprias, auditoria e dependências declaradas.

## Fundação
| Módulo | Escopo |
|---|---|
| Empresas e unidades | Tenant, filiais, plantas, turnos, calendários, parâmetros e módulos ativos. |
| Usuários e permissões | Auth, papéis, setores, matrícula/registro, permissões e segregação de funções. |
| Auditoria | Eventos, trilha de acesso, exportação autorizada e retenção. |
| Documentos | Arquivos, versões, aprovação, validade, assinatura, evidência e controle de acesso. |
| Notificações | In-app, e-mail, WhatsApp/SMS via integração, alertas e preferências. |

## Indústria e operação
| Módulo | Escopo |
|---|---|
| Engenharia | Produtos, fichas, BOM, roteiros, moldes, cavidades e revisões. |
| PCP/MRP/APS | Demanda, capacidade, programação, sequenciamento, setup e materiais. |
| Produção | OP, apontamento, ciclo, parada, refugo, retrabalho, moagem e OEE. |
| Qualidade | Inspeção, quarentena, RNC, CAPA, laudo, CoA, rastreabilidade e liberação. |
| CEP | Cartas de controle, limites, capacidade Cp/Cpk, amostragem e reação. |
| Rastreabilidade 360° | Resina/pigmento → OP → máquina/molde → inspeção → produto → expedição. |
| Sala limpa | Classificação, diferencial de pressão, temperatura, partículas, limpeza e registros. |
| Estoque/WMS | Lotes, validade, endereçamento, recebimento, pesagem, paletes e inventário. |
| Compras | Solicitação, cotação, pedido, fornecedor, recebimento e avaliação. |
| Vendas/CRM | Clientes, propostas, contratos, previsão, pedidos e atendimento. |
| Manutenção | Ativos, moldes, preventiva, corretiva, preditiva, peças e calibração. |

## Pessoas e conformidade
| Módulo | Escopo |
|---|---|
| RH | Cadastro, cargos, setores, admissões, treinamentos, férias, documentos e avaliações. |
| Ponto e jornada | Ponto por celular, GPS opcional, geofence, rede local, escalas, banco de horas e aprovação. |
| SST | PGR, PCMSO, ASO, riscos, EPIs, treinamentos, incidentes, CAT e inspeções. |
| Saúde ocupacional | Exames, aptidão, restrição, confidencialidade e vencimentos. |
| Meio ambiente | Resíduos, MTR, emissões, água, energia, licenças e indicadores. |
| Licenças | Licenças ambientais, sanitárias, bombeiros, operação, validade e renovação. |
| BPF/GMP | Procedimentos, treinamentos, desvios, CAPA, mudanças, registros e evidências. |

## Corporativo
| Módulo | Escopo |
|---|---|
| Financeiro | Contas a pagar/receber, caixa, conciliação, cobrança e fluxo. |
| Contábil | Plano de contas, centros de custo, lançamentos, fechamento e relatórios. |
| Fiscal | NF-e/NFS-e, regras, impostos, SPED, Bloco K e parametrização por vigência. |
| Custos | Custo padrão/real, margem, absorção, máquina, material e mão de obra. |
| BI | Indicadores, dashboards, metas, relatórios e exportação controlada. |
| Portal externo | Fornecedor, cliente, auditor, colaborador e consulta pública limitada. |

## Dependências de módulos
`rh_ponto` depende de `rh` e `empresas`. `laudos_coa` depende de `qualidade` e `documentos`. `sala_limpa` depende de `qualidade` e `documentos`. `rastreabilidade_360` depende de `producao`, `estoque` e `qualidade`. `cep` depende de `qualidade`. `fiscal` depende de `financeiro` e `documentos`.
