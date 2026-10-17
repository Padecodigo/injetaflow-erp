/**
 * Catálogo de módulos do InjetaFlow ERP compartilhado entre cliente e servidor.
 * Cada módulo define campos, colunas, busca, filtros e a chave de permissão.
 * O servidor monta a validação (Zod) a partir destas definições, então o
 * formulário do front e a regra do back nunca divergem.
 */

export const PERMISSION_KEYS = [
  "dashboard",
  "producao",
  "ordens",
  "qualidade",
  "estoque",
  "moldes",
  "materia_prima",
  "pigmentos",
  "manutencao",
  "rh",
  "financeiro",
  "solicitacoes",
  "usuarios",
  "configuracoes",
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];
export type AccessLevel = "ver" | "editar";
export type Permissions = Partial<Record<PermissionKey, AccessLevel>>;

export const PERMISSION_LABELS: Record<PermissionKey, string> = {
  dashboard: "Dashboard",
  producao: "Produção (apontamentos)",
  ordens: "Ordens de produção",
  qualidade: "Qualidade",
  estoque: "Estoque",
  moldes: "Moldes & ferramentaria",
  materia_prima: "Matéria-prima",
  pigmentos: "Pigmentos & cores",
  manutencao: "Manutenção",
  rh: "RH & ponto",
  financeiro: "Financeiro",
  solicitacoes: "Solicitações do site",
  usuarios: "Usuários e acessos",
  configuracoes: "Configurações",
};

export const PERFIS = ["Administrador", "Gestor", "Supervisor", "Operador", "Consulta"] as const;
export type Perfil = (typeof PERFIS)[number];

export const SETORES = ["Produção", "Qualidade", "Manutenção", "Ferramentaria", "Estoque", "RH", "Financeiro", "Comercial", "Administrativo"] as const;

/** Permissões sugeridas ao escolher um perfil (podem ser ajustadas módulo a módulo). */
export const PERFIL_PRESETS: Record<Perfil, Permissions> = {
  Administrador: Object.fromEntries(PERMISSION_KEYS.map(key => [key, "editar"])) as Permissions,
  Gestor: {
    dashboard: "ver", producao: "editar", ordens: "editar", qualidade: "editar", estoque: "editar", moldes: "editar",
    materia_prima: "editar", pigmentos: "editar", manutencao: "editar", rh: "editar", financeiro: "ver", solicitacoes: "editar",
  },
  Supervisor: { dashboard: "ver", producao: "editar", ordens: "editar", qualidade: "editar", estoque: "ver", moldes: "ver", manutencao: "editar" },
  Operador: { dashboard: "ver", producao: "editar", ordens: "ver", qualidade: "ver" },
  Consulta: { dashboard: "ver", producao: "ver", ordens: "ver", qualidade: "ver", estoque: "ver" },
};

export type FieldType = "text" | "email" | "number" | "money" | "date" | "datetime" | "textarea" | "select" | "ref";

export type FieldDef = {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: readonly string[];
  placeholder?: string;
  /** Para type "ref": módulo de onde vêm as opções e o campo exibido. */
  ref?: { module: ModuleKey; field: string; labelField?: string };
  /** Campo preenchido pelo servidor (não aparece no formulário). */
  readOnly?: boolean;
  /** Campo opcional apenas na edição. */
  hiddenOnCreate?: boolean;
  /** Campos numéricos: mínimo (padrão 0, nunca negativo), máximo e se aceita só inteiros. */
  min?: number;
  max?: number;
  integer?: boolean;
};

export type ModuleDef = {
  key: ModuleKey;
  permission: PermissionKey;
  route: string;
  label: string;
  singular: string;
  eyebrow: string;
  description: string;
  createLabel: string;
  fields: FieldDef[];
  /** Colunas da listagem (nomes de campos ou colunas virtuais conhecidas). */
  columns: string[];
  searchFields: string[];
  statusField?: string;
  /** Filtros adicionais (campos select) exibidos na listagem. */
  filterFields?: string[];
  uniqueFields?: string[];
  autoCode?: { field: string; prefix: string };
  /** Exibir o botão "Novo" (alguns registros só nascem por fluxos específicos). */
  allowCreate?: boolean;
};

export const MODULE_KEYS = [
  "ordens",
  "producao",
  "qualidade",
  "estoque",
  "movimentacoes",
  "moldes",
  "materia_prima",
  "pigmentos",
  "manutencao",
  "colaboradores",
  "ponto",
  "financeiro",
  "regras",
  "solicitacoes",
] as const;
export type ModuleKey = (typeof MODULE_KEYS)[number];

const PRIORIDADES = ["Normal", "Alta", "Urgente"] as const;

export const MODULES: Record<ModuleKey, ModuleDef> = {
  ordens: {
    key: "ordens", permission: "ordens", route: "/ordens", label: "Ordens de produção", singular: "ordem de produção",
    eyebrow: "Planejamento conectado", description: "Uma fila única para priorizar, liberar e acompanhar cada ordem de injeção.",
    createLabel: "Nova ordem",
    autoCode: { field: "codigo", prefix: "OP-" },
    fields: [
      { name: "codigo", label: "Ordem", type: "text", readOnly: true },
      { name: "cliente", label: "Cliente", type: "text", placeholder: "Ex.: Cliente A" },
      { name: "produto", label: "Produto", type: "text", required: true, placeholder: "Ex.: Tampa flip-top 28mm" },
      { name: "molde", label: "Molde", type: "ref", required: true, ref: { module: "moldes", field: "codigo", labelField: "descricao" } },
      { name: "maquina", label: "Máquina", type: "text", required: true, placeholder: "Ex.: INJ-07 · 180T" },
      { name: "quantidade", label: "Quantidade planejada", type: "number", required: true, min: 1 , integer: true },
      { name: "prioridade", label: "Prioridade", type: "select", options: PRIORIDADES, required: true },
      { name: "status", label: "Status", type: "select", options: ["Planejada", "Liberada", "Em produção", "Pausada", "Concluída", "Cancelada"], required: true },
      { name: "entrega", label: "Entrega prevista", type: "date", required: true },
      { name: "observacoes", label: "Observações", type: "textarea" },
    ],
    columns: ["codigo", "cliente", "produto", "maquina", "quantidade", "progresso", "prioridade", "status", "entrega"],
    searchFields: ["codigo", "cliente", "produto", "molde", "maquina"],
    statusField: "status",
    filterFields: ["prioridade"],
    allowCreate: true,
  },
  producao: {
    key: "producao", permission: "producao", route: "/producao", label: "Apontamentos de produção", singular: "apontamento",
    eyebrow: "Centro de comando", description: "Aponte peças boas e refugo por ordem usando a matrícula do operador.",
    createLabel: "Novo apontamento",
    autoCode: { field: "codigo", prefix: "AP-" },
    fields: [
      { name: "codigo", label: "Apontamento", type: "text", readOnly: true },
      { name: "ordem", label: "Ordem de produção", type: "ref", required: true, ref: { module: "ordens", field: "codigo", labelField: "produto" } },
      { name: "matricula", label: "Matrícula do operador", type: "text", required: true, placeholder: "Ex.: MAT-0001" },
      { name: "operador", label: "Operador", type: "text", readOnly: true },
      { name: "quantidadeBoa", label: "Peças boas", type: "number", required: true, min: 0 , integer: true },
      { name: "refugo", label: "Refugo (peças)", type: "number", min: 0 , integer: true },
      { name: "turno", label: "Turno", type: "select", options: ["1º turno", "2º turno", "3º turno"], required: true },
      { name: "observacoes", label: "Observações", type: "textarea" },
    ],
    columns: ["codigo", "ordem", "matricula", "operador", "quantidadeBoa", "refugo", "turno", "createdAt"],
    searchFields: ["codigo", "ordem", "matricula", "operador"],
    filterFields: ["turno"],
    allowCreate: true,
  },
  qualidade: {
    key: "qualidade", permission: "qualidade", route: "/qualidade", label: "Qualidade", singular: "registro de qualidade",
    eyebrow: "Conformidade em dia", description: "Inspeções, não conformidades e liberação de lotes com responsável e histórico.",
    createLabel: "Novo registro",
    autoCode: { field: "codigo", prefix: "QL-" },
    fields: [
      { name: "codigo", label: "Registro", type: "text", readOnly: true },
      { name: "tipo", label: "Tipo", type: "select", options: ["Inspeção", "Não conformidade", "Liberação de lote", "Reclamação de cliente", "Melhoria"], required: true },
      { name: "loteOrdem", label: "Lote ou ordem", type: "text", required: true, placeholder: "Ex.: LOTE-001 / OP-0001" },
      { name: "produto", label: "Produto / material", type: "text", required: true },
      { name: "responsavel", label: "Responsável", type: "text" },
      { name: "severidade", label: "Severidade", type: "select", options: ["Baixa", "Média", "Alta", "Crítica"], required: true },
      { name: "status", label: "Status", type: "select", options: ["Aberto", "Em análise", "Quarentena", "Aprovado", "Liberado", "Reprovado", "Encerrado"], required: true },
      { name: "descricao", label: "Descrição e evidências", type: "textarea", required: true },
    ],
    columns: ["codigo", "tipo", "loteOrdem", "produto", "responsavel", "severidade", "status", "createdAt"],
    searchFields: ["codigo", "loteOrdem", "produto", "responsavel", "descricao"],
    statusField: "status",
    filterFields: ["tipo", "severidade"],
    allowCreate: true,
  },
  estoque: {
    key: "estoque", permission: "estoque", route: "/estoque", label: "Estoque", singular: "item de estoque",
    eyebrow: "Materiais em movimento", description: "Resinas, pigmentos, embalagens e produtos com lote, saldo, mínimo e localização.",
    createLabel: "Novo item",
    uniqueFields: ["codigo"],
    fields: [
      { name: "codigo", label: "Código", type: "text", required: true, placeholder: "Ex.: RES-PP-01" },
      { name: "material", label: "Material / produto", type: "text", required: true },
      { name: "categoria", label: "Categoria", type: "select", options: ["Resina", "Pigmento/Masterbatch", "Embalagem", "Componente", "Produto acabado", "Outro"], required: true },
      { name: "lote", label: "Lote", type: "text" },
      { name: "saldo", label: "Saldo", type: "number", required: true, min: 0 },
      { name: "unidade", label: "Unidade", type: "select", options: ["kg", "un", "cx", "L", "m"], required: true },
      { name: "estoqueMinimo", label: "Estoque mínimo", type: "number", min: 0 },
      { name: "local", label: "Local", type: "text", placeholder: "Ex.: Silo 02 / A-01-03" },
      { name: "validade", label: "Validade", type: "date" },
      { name: "status", label: "Situação", type: "select", options: ["Normal", "Reposição", "Quarentena", "Bloqueado"], required: true },
    ],
    columns: ["codigo", "material", "categoria", "lote", "saldo", "estoqueMinimo", "local", "validade", "status"],
    searchFields: ["codigo", "material", "lote", "local"],
    statusField: "status",
    filterFields: ["categoria"],
    allowCreate: true,
  },
  movimentacoes: {
    key: "movimentacoes", permission: "estoque", route: "/estoque", label: "Movimentações de estoque", singular: "movimentação",
    eyebrow: "Histórico", description: "Entradas, saídas e ajustes de saldo com responsável.",
    createLabel: "Nova movimentação",
    fields: [
      { name: "item", label: "Item", type: "ref", required: true, ref: { module: "estoque", field: "codigo", labelField: "material" } },
      { name: "tipo", label: "Tipo", type: "select", options: ["Entrada", "Saída", "Ajuste"], required: true },
      { name: "quantidade", label: "Quantidade", type: "number", required: true, min: 0 },
      { name: "saldoAnterior", label: "Saldo anterior", type: "number", readOnly: true },
      { name: "saldoNovo", label: "Saldo novo", type: "number", readOnly: true },
      { name: "documento", label: "Documento / referência", type: "text" },
      { name: "observacoes", label: "Observações", type: "textarea" },
    ],
    columns: ["item", "tipo", "quantidade", "saldoAnterior", "saldoNovo", "documento", "createdAt"],
    searchFields: ["item", "documento", "observacoes"],
    filterFields: ["tipo"],
    allowCreate: true,
  },
  moldes: {
    key: "moldes", permission: "moldes", route: "/moldes", label: "Moldes & ferramentaria", singular: "molde",
    eyebrow: "Engenharia e ferramentaria", description: "Ciclo de vida dos moldes, cavidades, manutenções e disponibilidade por máquina.",
    createLabel: "Novo molde",
    uniqueFields: ["codigo"],
    fields: [
      { name: "codigo", label: "Código do molde", type: "text", required: true, placeholder: "Ex.: M-0001" },
      { name: "descricao", label: "Descrição", type: "text", required: true },
      { name: "produto", label: "Produto", type: "text" },
      { name: "cavidades", label: "Cavidades", type: "number", required: true, min: 1, max: 1024, integer: true },
      { name: "cavidadesAtivas", label: "Cavidades ativas", type: "number", min: 0, max: 1024, integer: true },
      { name: "ciclos", label: "Ciclos acumulados", type: "number", min: 0 , integer: true },
      { name: "maquina", label: "Máquina compatível", type: "text" },
      { name: "ultimaManutencao", label: "Última manutenção", type: "date" },
      { name: "proximaAcao", label: "Próxima ação", type: "text" },
      { name: "status", label: "Status", type: "select", options: ["Disponível", "Em uso", "Em manutenção", "Atenção", "Inativo"], required: true },
    ],
    columns: ["codigo", "descricao", "produto", "cavidades", "ciclos", "ultimaManutencao", "proximaAcao", "status"],
    searchFields: ["codigo", "descricao", "produto", "maquina"],
    statusField: "status",
    allowCreate: true,
  },
  materia_prima: {
    key: "materia_prima", permission: "materia_prima", route: "/materia-prima", label: "Matéria-prima", singular: "lote de matéria-prima",
    eyebrow: "Materiais controlados", description: "Resinas, aditivos e cargas com lote, fornecedor, validade e liberação.",
    createLabel: "Nova matéria-prima",
    fields: [
      { name: "codigo", label: "Código", type: "text", required: true, placeholder: "Ex.: RES-PP-01" },
      { name: "material", label: "Material", type: "text", required: true },
      { name: "tipo", label: "Tipo", type: "select", options: ["Resina virgem", "Resina reciclada (PCR)", "Aditivo", "Carga"], required: true },
      { name: "fornecedor", label: "Fornecedor", type: "text", required: true },
      { name: "lote", label: "Lote", type: "text", required: true },
      { name: "quantidade", label: "Quantidade (kg)", type: "number", required: true, min: 0 },
      { name: "validade", label: "Validade", type: "date" },
      { name: "status", label: "Status", type: "select", options: ["Liberado", "Quarentena", "Atenção", "Bloqueado"], required: true },
    ],
    columns: ["codigo", "material", "tipo", "fornecedor", "lote", "quantidade", "validade", "status"],
    searchFields: ["codigo", "material", "fornecedor", "lote"],
    statusField: "status",
    filterFields: ["tipo"],
    allowCreate: true,
  },
  pigmentos: {
    key: "pigmentos", permission: "pigmentos", route: "/pigmentos", label: "Pigmentos & cores", singular: "pigmento",
    eyebrow: "Desenvolvimento de cores", description: "Masterbatch, formulações, padrões de cor, testes e aprovação por produto.",
    createLabel: "Novo pigmento",
    uniqueFields: ["codigo"],
    fields: [
      { name: "codigo", label: "Código da cor", type: "text", required: true, placeholder: "Ex.: COR-BR-01" },
      { name: "cor", label: "Cor / aplicação", type: "text", required: true },
      { name: "masterbatch", label: "Masterbatch", type: "text" },
      { name: "lote", label: "Lote", type: "text" },
      { name: "concentracao", label: "Concentração (%)", type: "number", min: 0, max: 100 },
      { name: "padrao", label: "Padrão de referência", type: "text" },
      { name: "ultimoTeste", label: "Último teste", type: "date" },
      { name: "status", label: "Status", type: "select", options: ["Aprovado", "Em teste", "Reprovado", "Inativo"], required: true },
    ],
    columns: ["codigo", "cor", "masterbatch", "concentracao", "padrao", "ultimoTeste", "status"],
    searchFields: ["codigo", "cor", "masterbatch", "lote", "padrao"],
    statusField: "status",
    allowCreate: true,
  },
  manutencao: {
    key: "manutencao", permission: "manutencao", route: "/manutencao", label: "Manutenção", singular: "ordem de serviço",
    eyebrow: "Ativos críticos", description: "Ordens de serviço para injetoras, moldes e periféricos, da abertura ao encerramento.",
    createLabel: "Nova OS",
    autoCode: { field: "codigo", prefix: "OS-" },
    fields: [
      { name: "codigo", label: "OS", type: "text", readOnly: true },
      { name: "ativo", label: "Ativo", type: "text", required: true, placeholder: "Ex.: INJ-07 / M-0001" },
      { name: "tipo", label: "Tipo", type: "select", options: ["Corretiva", "Preventiva", "Preditiva", "Lubrificação", "Ferramentaria"], required: true },
      { name: "prioridade", label: "Prioridade", type: "select", options: ["Programada", "Alta", "Parada imediata"], required: true },
      { name: "responsavel", label: "Responsável", type: "text" },
      { name: "previsao", label: "Previsão", type: "date" },
      { name: "status", label: "Status", type: "select", options: ["Aberta", "Em execução", "Aguardando peça", "Concluída", "Cancelada"], required: true },
      { name: "descricao", label: "Descrição", type: "textarea", required: true },
    ],
    columns: ["codigo", "ativo", "tipo", "prioridade", "responsavel", "previsao", "status"],
    searchFields: ["codigo", "ativo", "responsavel", "descricao"],
    statusField: "status",
    filterFields: ["tipo", "prioridade"],
    allowCreate: true,
  },
  colaboradores: {
    key: "colaboradores", permission: "rh", route: "/rh", label: "Colaboradores", singular: "colaborador",
    eyebrow: "Pessoas em movimento", description: "Cadastro de colaboradores, matrícula, setor e jornada.",
    createLabel: "Novo colaborador",
    uniqueFields: ["matricula"],
    fields: [
      { name: "matricula", label: "Matrícula", type: "text", required: true, placeholder: "Ex.: MAT-0001" },
      { name: "nome", label: "Nome completo", type: "text", required: true },
      { name: "cargo", label: "Cargo", type: "text", required: true },
      { name: "setor", label: "Setor", type: "select", options: SETORES, required: true },
      { name: "turno", label: "Turno", type: "select", options: ["1º turno (06–14)", "2º turno (14–22)", "3º turno (22–06)", "Administrativo (08–17)"], required: true },
      { name: "admissao", label: "Admissão", type: "date" },
      { name: "status", label: "Status", type: "select", options: ["Ativo", "Férias", "Afastado", "Desligado"], required: true },
    ],
    columns: ["matricula", "nome", "cargo", "setor", "turno", "status"],
    searchFields: ["matricula", "nome", "cargo"],
    statusField: "status",
    filterFields: ["setor", "turno"],
    allowCreate: true,
  },
  ponto: {
    key: "ponto", permission: "rh", route: "/rh", label: "Registros de ponto", singular: "registro de ponto",
    eyebrow: "Ponto", description: "Batidas de ponto com origem do registro.",
    createLabel: "Registrar ponto",
    fields: [
      { name: "matricula", label: "Matrícula", type: "text", required: true },
      { name: "nome", label: "Colaborador", type: "text", readOnly: true },
      { name: "tipo", label: "Tipo", type: "select", options: ["Entrada", "Início de intervalo", "Fim de intervalo", "Saída"], required: true },
      { name: "dataHora", label: "Data e hora", type: "datetime", readOnly: true },
      { name: "origem", label: "Origem", type: "select", options: ["GPS", "Rede local", "Manual"], required: true },
      { name: "simulado", label: "Origem simulada", type: "text", readOnly: true },
      // F0a: batida fora de sequência é gravada e sinalizada (Portaria 671, arts. 74 e 98), nunca recusada
      { name: "validacao", label: "Validação", type: "text", readOnly: true },
      { name: "divergencia", label: "Divergência", type: "text", readOnly: true },
      { name: "observacao", label: "Observação", type: "textarea" },
    ],
    columns: ["dataHora", "matricula", "nome", "tipo", "origem", "simulado"],
    searchFields: ["matricula", "nome"],
    filterFields: ["tipo", "origem"],
    allowCreate: false,
  },
  financeiro: {
    key: "financeiro", permission: "financeiro", route: "/financeiro", label: "Financeiro", singular: "lançamento",
    eyebrow: "Margem no radar", description: "Contas a pagar e a receber, custos industriais e receitas.",
    createLabel: "Novo lançamento",
    autoCode: { field: "codigo", prefix: "LF-" },
    fields: [
      { name: "codigo", label: "Lançamento", type: "text", readOnly: true },
      { name: "tipo", label: "Tipo", type: "select", options: ["Conta a pagar", "Conta a receber", "Custo industrial", "Receita"], required: true },
      { name: "descricao", label: "Descrição", type: "text", required: true },
      { name: "centroCusto", label: "Centro de custo", type: "text" },
      { name: "valor", label: "Valor (R$)", type: "money", required: true, min: 0 },
      { name: "vencimento", label: "Vencimento", type: "date", required: true },
      { name: "status", label: "Status", type: "select", options: ["Em aberto", "Pago", "Recebido", "Atrasado", "Cancelado"], required: true },
    ],
    columns: ["codigo", "tipo", "descricao", "centroCusto", "valor", "vencimento", "status"],
    searchFields: ["codigo", "descricao", "centroCusto"],
    statusField: "status",
    filterFields: ["tipo"],
    allowCreate: true,
  },
  regras: {
    key: "regras", permission: "configuracoes", route: "/configuracoes", label: "Regras operacionais", singular: "regra",
    eyebrow: "Seu jeito de operar", description: "Parâmetros que orientam aprovações, alertas e rotinas do ERP.",
    createLabel: "Nova regra",
    fields: [
      { name: "nome", label: "Nome da regra", type: "text", required: true },
      { name: "modulo", label: "Módulo", type: "select", options: ["Produção", "Qualidade", "Estoque", "Manutenção", "RH", "Financeiro"], required: true },
      { name: "condicao", label: "Condição", type: "text", required: true, placeholder: "Ex.: Estoque abaixo do mínimo" },
      { name: "responsavel", label: "Responsável", type: "text", required: true },
      { name: "status", label: "Situação", type: "select", options: ["Ativa", "Inativa"], required: true },
      { name: "detalhamento", label: "Detalhamento", type: "textarea" },
    ],
    columns: ["nome", "modulo", "condicao", "responsavel", "status"],
    searchFields: ["nome", "condicao", "responsavel"],
    statusField: "status",
    filterFields: ["modulo"],
    allowCreate: true,
  },
  solicitacoes: {
    key: "solicitacoes", permission: "solicitacoes", route: "/solicitacoes", label: "Solicitações do site", singular: "solicitação",
    eyebrow: "Portal público", description: "Cotações, contatos e currículos enviados pelo site da Wamovale.",
    createLabel: "Registrar contato",
    autoCode: { field: "codigo", prefix: "SOL-" },
    fields: [
      { name: "codigo", label: "Protocolo", type: "text", readOnly: true },
      { name: "tipo", label: "Tipo", type: "select", options: ["Cotação", "Contato", "Currículo"], required: true },
      { name: "nome", label: "Nome", type: "text", required: true },
      { name: "empresa", label: "Empresa", type: "text" },
      { name: "email", label: "E-mail", type: "email", required: true },
      { name: "telefone", label: "Telefone", type: "text" },
      { name: "assunto", label: "Assunto / área", type: "text" },
      { name: "mensagem", label: "Mensagem", type: "textarea" },
      { name: "detalhes", label: "Detalhes do formulário", type: "textarea", readOnly: true },
      { name: "anexo", label: "Anexo", type: "text", readOnly: true },
      { name: "status", label: "Status", type: "select", options: ["Novo", "Em atendimento", "Respondido", "Arquivado"], required: true },
      { name: "anotacoes", label: "Anotações internas", type: "textarea" },
    ],
    columns: ["codigo", "tipo", "nome", "empresa", "email", "assunto", "anexo", "status", "createdAt"],
    searchFields: ["codigo", "nome", "empresa", "email", "assunto", "mensagem"],
    statusField: "status",
    filterFields: ["tipo"],
    allowCreate: true,
  },
};

export function getModule(key: string): ModuleDef | undefined {
  return (MODULES as Record<string, ModuleDef>)[key];
}

export function isAdminPerfil(perfil: string | undefined | null): boolean {
  return perfil === "Administrador";
}

/** Regra única de permissão usada no front e no servidor. */
export function hasPermission(
  user: { perfil?: string | null; permissoes?: Permissions | null } | null | undefined,
  key: PermissionKey,
  level: AccessLevel = "ver"
): boolean {
  if (!user) return false;
  if (isAdminPerfil(user.perfil)) return true;
  const granted = user.permissoes?.[key];
  if (!granted) return false;
  if (level === "ver") return granted === "ver" || granted === "editar";
  return granted === "editar";
}

/**
 * R-01: módulos do alvo que excedem os de quem edita (nível maior ou módulo que ele não tem).
 * Lista vazia = as permissões do alvo são um subconjunto das de quem edita.
 * Administrador (alvo) nunca é subconjunto de um não administrador.
 */
export function permissionsBeyond(
  actor: { perfil?: string | null; permissoes?: Permissions | null } | null | undefined,
  target: { perfil?: string | null; permissoes?: Permissions | null }
): PermissionKey[] {
  if (isAdminPerfil(actor?.perfil)) return [];
  if (isAdminPerfil(target.perfil)) return [...PERMISSION_KEYS];
  return PERMISSION_KEYS.filter(key => {
    const level = target.permissoes?.[key];
    return level === "ver" || level === "editar" ? !hasPermission(actor, key, level) : false;
  });
}

export const COLUMN_LABELS: Record<string, string> = {
  progresso: "Progresso",
  createdAt: "Registrado em",
  updatedAt: "Atualizado em",
};

export function columnLabel(mod: ModuleDef, column: string): string {
  return mod.fields.find(field => field.name === column)?.label ?? COLUMN_LABELS[column] ?? column;
}
