# Política de retenção, quarentena e desligamento

## Decisão de produto

O ERP deve tratar desligamento de colaborador, retenção legal e quarentena de qualidade como fluxos distintos. Não existirá um único processo genérico de “apagar tudo depois de dois anos”. Cada categoria de dado terá finalidade, prazo de retenção, nível de acesso e regra de eliminação próprios.

A LGPD determina que o tratamento termine quando a finalidade for alcançada, quando os dados deixarem de ser necessários ou quando terminar o período de tratamento. Depois disso, a eliminação é a regra, mas a lei admite conservação em hipóteses específicas, como cumprimento de obrigação legal ou regulatória e exercício regular de direitos em processo judicial, administrativo ou arbitral. A política final deve ser validada pelo jurídico, contador e responsável de privacidade do cliente.

## Desligamento de colaborador

Ao confirmar a demissão, o sistema executará um fluxo transacional e auditado:

1. Alterar o status do colaborador para `desligado`;
2. Revogar imediatamente sessões ativas, refresh tokens, tokens de API, dispositivos confiáveis e acessos externos;
3. Remover o colaborador de cargos, grupos, escalas, aprovações e permissões operacionais;
4. Bloquear novos apontamentos, alterações e aprovações em nome dele;
5. Encerrar ou transferir tarefas, ordens, pendências e aprovações abertas;
6. Preservar a autoria histórica dos registros que ele realizou;
7. Mover documentos e dados pessoais para um repositório de retenção restrito, sem deixar o perfil acessível na operação normal;
8. Registrar quem confirmou o desligamento, data, motivo operacional, escopo afetado e resultado de cada revogação;
9. Notificar RH, TI, segurança e gestores responsáveis conforme a política do tenant.

O sistema não deve apagar o nome do autor de uma ordem, inspeção, aprovação ou alteração histórica. Se a eliminação do dado pessoal for necessária, a aplicação deve avaliar anonimização ou pseudonimização sem destruir a evidência operacional exigida.

## Banco de retenção do colaborador

O “banco de quarentena” de RH será implementado como um **cofre de retenção**, com acesso separado e mínimo privilégio. Ele não deve ser consultável pelo colaborador comum nem aparecer em buscas operacionais.

O cofre deverá ter:

- Dados criptografados em repouso;
- Chave de acesso separada da base operacional;
- Acesso somente para RH autorizado, jurídico, privacidade e administradores designados;
- Registro de leitura, exportação, restauração e eliminação;
- Retenção por categoria de documento;
- Exclusão automática somente quando não existir obrigação, investigação ou processo pendente;
- Bloqueio de eliminação quando existir `legal_hold`;
- Relatório de itens próximos do vencimento;
- Job idempotente de expurgo, com dupla confirmação para dados sensíveis.

O prazo de dois anos pode ser uma regra inicial de negócio para uma categoria específica, mas deve ser configurável por tenant e por tipo de registro. Não deve ser tratado como prazo legal universal. O eSocial, por exemplo, orienta a guarda de determinados documentos trabalhistas por cinco anos em contexto específico, o que demonstra a necessidade de uma matriz de retenção antes do expurgo.

## Matriz inicial de retenção

A matriz abaixo é um ponto de partida de produto, não uma autorização jurídica automática:

| Categoria | Estado após desligamento | Prazo inicial do produto | Regra especial |
|---|---|---:|---|
| Sessões, tokens e dispositivos | Revogados imediatamente | Não reter tokens ativos | Manter somente evidência técnica mínima de revogação |
| Perfil operacional | Inativo e restrito | Conforme matriz jurídica | Não aparece na operação normal |
| Registros de ponto e jornada | Cofre de retenção | Configurável | Validar obrigações trabalhistas e eSocial |
| Folha, férias e rescisão | Cofre de retenção | Configurável | Nunca usar automaticamente dois anos |
| Avaliações e medidas disciplinares | Cofre restrito | Configurável | Acesso RH/jurídico e legal hold |
| Auditoria de ações no ERP | Arquivo imutável | Configurável | Preservar autoria e integridade |
| Dados de saúde ocupacional | Cofre altamente restrito | Conforme norma aplicável | Separar de RH geral; acesso mínimo |
| Documentos pessoais sem obrigação vigente | Candidatos a expurgo | 2 anos, se aprovado | Anonimizar ou eliminar com evidência |

## Quarentena de qualidade

A quarentena da qualidade é diferente do cofre de desligamento. Ela representa um **estado operacional de material, lote, componente ou produto**, e não um local para esconder ou apagar dados.

Um lote em quarentena deve:

- Ficar bloqueado para consumo, produção, expedição ou liberação;
- Manter lote, fornecedor, certificado, origem, quantidade e localização;
- Registrar motivo, não conformidade, responsável e data;
- Permitir decisão de liberar, reprovar, retrabalhar, devolver ou sucatear;
- Exigir aprovação conforme o nível de risco;
- Preservar fotos, laudos, medições, amostras e histórico;
- Propagar o bloqueio para produtos e ordens que consumiram o lote quando necessário;
- Manter trilha de auditoria sem edição destrutiva.

Exemplos: resina com laudo pendente, pigmento fora do padrão, lote com umidade elevada, produto com desvio dimensional, molde que exige inspeção ou embalagem aguardando decisão da qualidade.

## Outros setores que precisam de retenção ou quarentena

O mesmo padrão deve ser aplicado, com regras próprias, a:

- **Financeiro e fiscal:** documentos sujeitos a obrigações contábeis, fiscais e auditorias;
- **Saúde e segurança do trabalho:** acidentes, exames, treinamentos, EPIs e evidências de investigação;
- **Meio ambiente:** licenças, resíduos, manifestos, medições e condicionantes;
- **Manutenção:** falhas críticas, ordens de serviço, fotos e evidências de causa raiz;
- **Documentos e licenças:** versões vencidas, documentos substituídos e comprovações regulatórias;
- **Fornecedores e clientes:** disputas, devoluções, reclamações, contratos e evidências comerciais;
- **Cibersegurança:** incidentes, logs de autenticação e evidências de investigação;
- **Produção:** lotes, ordens, parâmetros, refugos e rastreabilidade reversa.

## Máquina de estados comum

Cada registro sujeito a retenção deve ter estados explícitos:

```text
ATIVO
  → BLOQUEADO_OPERACIONALMENTE
  → RETIDO
  → LEGAL_HOLD (se houver processo ou investigação)
  → ELEGÍVEL_PARA_EXPURGO
  → ANONIMIZADO ou ELIMINADO
```

A transição para `ELEGÍVEL_PARA_EXPURGO` nunca deve ocorrer apenas pela passagem do tempo. O job deve verificar finalidade, prazo aplicável, dependências, legal hold, auditoria e autorização da política do tenant.

## Requisitos obrigatórios de implementação

- Serviço central de retenção, usado por RH, Qualidade, Documentos, Fiscal, Segurança e demais módulos;
- Tabela de políticas por tenant, categoria, finalidade e prazo;
- Tabela de `legal_holds` com motivo, autoridade, data de início e encerramento;
- Tabela de eventos de expurgo com hash, operador, data e resultado;
- Exclusão lógica antes da eliminação física quando a operação exigir período de conferência;
- Jobs idempotentes, retomáveis e com relatório de falhas;
- Teste unitário para cada regra de transição;
- Teste de integração para revogação completa de acesso;
- Teste de regressão para garantir que registros históricos continuem auditáveis;
- Teste de segurança para confirmar que usuário desligado não consegue autenticar nem reutilizar sessão antiga;
- Teste de quarentena para garantir que lote bloqueado não seja consumido ou expedido.

## Referências

- [1] [Lei nº 13.709/2018 — LGPD, Planalto](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm) — término do tratamento e hipóteses de conservação.
- [2] [Tratamento de Dados Pessoais — Ministério do Planejamento](https://www.gov.br/planejamento/pt-br/acesso-a-informacao/tratamento-de-dados-pessoais) — finalidade, retenção, eliminação, segurança e direitos do titular.
- [3] [Perguntas frequentes do eSocial](https://www.gov.br/esocial/pt-br/empregador-domestico/perguntas-frequentes) — exemplo oficial de prazo de guarda de documentos trabalhistas.
