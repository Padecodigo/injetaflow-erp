import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Seção crítica por chave (fila FIFO de promessas), reentrante no mesmo fluxo assíncrono.
 *
 * Auditoria de frontend (item de backend): duas criações no mesmo instante liam o "próximo código" ou
 * conferiam unicidade (e-mail, código, matrícula) antes de qualquer uma gravar, porque cada `await`
 * entre a leitura e o insert deixa outra requisição entrar. Dentro da seção, a leitura, a checagem e a
 * gravação de uma escrita terminam antes da próxima começar.
 */
const filas = new Map<string, Promise<void>>();
const dentro = new AsyncLocalStorage<ReadonlySet<string>>();

export function emSecaoCritica<T>(chave: string, fn: () => Promise<T>): Promise<T> {
  const atuais = dentro.getStore();
  if (atuais?.has(chave)) return fn(); // reentrância: já estamos dentro desta seção
  const anterior = filas.get(chave) ?? Promise.resolve();
  const proximas = new Set(atuais ?? []).add(chave);
  const execucao = anterior.then(() => dentro.run(proximas, fn));
  const cauda = execucao.then(
    () => undefined,
    () => undefined
  );
  filas.set(chave, cauda);
  void cauda.then(() => {
    if (filas.get(chave) === cauda) filas.delete(chave);
  });
  return execucao;
}

/** Quantas chaves têm fila ativa (diagnóstico e testes). */
export function filasAtivas(): number {
  return filas.size;
}
