import { useSyncExternalStore } from "react";

/**
 * F-01 (auditoria de frontend): contador de modais abertos. Enquanto houver modal aberto, o Toaster
 * sai do canto inferior (onde ficam os botões de ação dos modais) para o topo, e nenhum aviso cobre
 * "Salvar" / "Cadastrar usuário".
 */
let open = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(listener => listener());

export function pushModal() {
  open += 1;
  emit();
  return () => {
    open = Math.max(0, open - 1);
    emit();
  };
}

export function useModalOpen() {
  return useSyncExternalStore(
    listener => { listeners.add(listener); return () => listeners.delete(listener); },
    () => open > 0,
    () => false,
  );
}
