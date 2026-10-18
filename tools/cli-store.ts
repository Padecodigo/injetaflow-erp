/**
 * B-04: abertura do store pelas CLIs que gravam. Recusa com o servidor no ar (trava da pasta de dados
 * ou servidor desta pasta respondendo na porta) com "pare o servidor antes", em vez de gravar algo que
 * a memória do servidor sobrescreveria. Ao terminar, consolida o snapshot e confere que gravou.
 */
import { JsonFileRepository, type DataRepository } from "../server/erp/repository";
import { dataDir, getRepository, storePath } from "../server/erp/store";
import { exigirServidorParado, PastaDeDadosEmUsoError } from "../server/erp/trava";

export async function abrirStoreParaGravar(comando: string): Promise<DataRepository> {
  try {
    await exigirServidorParado(dataDir(), comando);
  } catch (error) {
    if (error instanceof PastaDeDadosEmUsoError) {
      console.error(error.message);
      process.exit(2);
    }
    throw error;
  }
  return getRepository();
}

/**
 * Consolida o que a CLI gravou e relê o arquivo do disco para conferir (`conferir` devolve true se
 * a mudança está lá). Só então a CLI pode dizer que deu certo.
 */
export async function confirmarGravacao(conferir: (lido: DataRepository) => Promise<boolean>): Promise<void> {
  const repo = getRepository();
  if (repo instanceof JsonFileRepository) repo.close();
  const lido = new JsonFileRepository(storePath());
  try {
    if (!(await conferir(lido))) throw new Error("A gravação não foi confirmada no arquivo de dados. Nada deve ser considerado alterado; rode de novo com o servidor parado.");
  } finally {
    lido.close();
  }
}
