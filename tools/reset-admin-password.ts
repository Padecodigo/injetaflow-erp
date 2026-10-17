/**
 * Redefine a senha de um usuário do ERP local (útil se a senha gerada no 1º start se perdeu).
 * Uso:  pnpm erp:reset-senha [email]
 *   - email padrão: INJETAFLOW_ADMIN_EMAIL ou admin@wamovale.local
 *   - senha: INJETAFLOW_ADMIN_PASSWORD, ou gerada e mostrada só neste console.
 * Encerra as sessões abertas do usuário. Não envia nada para fora da máquina.
 */
import "dotenv/config";
import { getRepository, DEFAULT_EMPRESA_ID } from "../server/erp/store";
import { USERS, destroyUserSessions, hashUserPassword } from "../server/erp/auth";
import { generatePassword } from "../server/erp/password";
import type { UserData } from "../server/erp/types";

async function main() {
  const email = (process.argv[2] || process.env.INJETAFLOW_ADMIN_EMAIL || "admin@wamovale.local").trim().toLowerCase();
  const fromEnv = process.env.INJETAFLOW_ADMIN_PASSWORD;
  if (fromEnv && fromEnv.length < 8) throw new Error("INJETAFLOW_ADMIN_PASSWORD precisa ter pelo menos 8 caracteres.");
  const senha = fromEnv || generatePassword(16);
  const repo = getRepository();
  const { items } = await repo.list<UserData>(USERS, DEFAULT_EMPRESA_ID, { filter: data => data.email === email });
  const user = items[0];
  if (!user) {
    console.error(`Usuário ${email} não encontrado em ${DEFAULT_EMPRESA_ID}. Rode "pnpm dev" uma vez para criar o administrador inicial.`);
    process.exit(1);
  }
  await repo.update<UserData>(USERS, DEFAULT_EMPRESA_ID, user.id, { senhaHash: hashUserPassword(senha), status: "Ativo" }, { id: "cli", nome: "Linha de comando", matricula: null });
  await destroyUserSessions(repo, user.id);
  console.log(`Senha de ${email} redefinida.`);
  console.log(fromEnv ? "Senha: a definida em INJETAFLOW_ADMIN_PASSWORD." : `Nova senha (mostrada só agora): ${senha}`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
