/**
 * N09: rótulo da opção "todos" nos filtros, com plural e gênero corretos em português
 * (antes: "Todos os statuss", "Todos os situaçãos").
 */
const TODOS: Record<string, string> = {
  status: "Todos os status",
  "situação": "Todas as situações",
  categoria: "Todas as categorias",
  "módulo": "Todos os módulos",
  origem: "Todas as origens",
  prioridade: "Todas as prioridades",
  setor: "Todos os setores",
  severidade: "Todas as severidades",
  tipo: "Todos os tipos",
  turno: "Todos os turnos",
  unidade: "Todas as unidades",
  perfil: "Todos os perfis",
};

export function filterAllLabel(label: string): string {
  return TODOS[label.trim().toLowerCase()] ?? `${label}: todos`;
}
