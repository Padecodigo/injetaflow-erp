/**
 * Redefine a senha (e, se quiser, o nome de usuário) de um usuário do ERP local.
 * Útil se a senha gerada no 1º start se perdeu. Pare o `pnpm dev` antes de rodar.
 *
 * Uso:
 *   pnpm erp:reset-senha [identificador] [--username novo] [--manter-senha]
 *
 *   identificador  e-mail, nome de usuário ou matrícula. Padrão: INJETAFLOW_RESET_USER,
 *                  INJETAFLOW_ADMIN_EMAIL ou o administrador mais antigo da empresa.
 *   --username X   (ou INJETAFLOW_ADMIN_USERNAME=X) define o nome de usuário (único na empresa).
 *   --manter-senha só ajusta o nome de usuário e reativa, sem trocar a senha.
 *
 * Senha: INJETAFLOW_ADMIN_PASSWORD (mínimo 6 caracteres; NUNCA é impressa) ou gerada e
 * mostrada só neste console. Nada é gravado em arquivo além do hash. Encerra as sessões abertas.
 *
 * Exemplo (sem deixar a senha no histórico do shell):
 *   read -rsp 'Senha: ' INJETAFLOW_ADMIN_PASSWORD; echo; export INJETAFLOW_ADMIN_PASSWORD
 *   INJETAFLOW_ADMIN_USERNAME=admin pnpm erp:reset-senha; unset INJETAFLOW_ADMIN_PASSWORD
 */
import "dotenv/config";
import { PASSWORD_MIN_LENGTH, normalizeUsername, usernameError } from "../shared/erp/account";
import { isAdminPerfil } from "../shared/erp/modules";
import { getRepository, DEFAULT_EMPRESA_ID } from "../server/erp/store";
import { USERS, destroyUserSessions, findLoginCandidates, hashUserPassword } from "../server/erp/auth";
import { generatePassword } from "../server/erp/password";
import { assertUsernameFree, listDeletedUsers, migrateUsernames } from "../server/erp/users";
import { AUTOR_CLI, audit, systemActor } from "../server/erp/audit";
import type { UserData } from "../server/erp/types";

export function parseArgs(argv: string[]) {
  let identificador: string | undefined;
  let username: string | undefined;
  let manterSenha = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--") continue;
    if (arg === "--manter-senha") manterSenha = true;
    else if (arg === "--username" || arg === "-u") username = argv[++i];
    else if (arg.startsWith("--username=")) username = arg.slice("--username=".length);
    else if (!arg.startsWith("-") && !identificador) identificador = arg;
    else throw new Error(`Argumento desconhecido: ${arg}`);
  }
  return { identificador, username, manterSenha };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const empresaId = process.env.INJETAFLOW_EMPRESA || DEFAULT_EMPRESA_ID;
  const fromEnv = process.env.INJETAFLOW_ADMIN_PASSWORD;
  if (!args.manterSenha && fromEnv !== undefined && fromEnv.length < PASSWORD_MIN_LENGTH) {
    throw new Error(`INJETAFLOW_ADMIN_PASSWORD precisa ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`);
  }
  const novoUsername = args.username ?? process.env.INJETAFLOW_ADMIN_USERNAME;
  if (novoUsername !== undefined) {
    const error = usernameError(novoUsername);
    if (error) throw new Error(error);
  }

  const repo = getRepository();
  await migrateUsernames(repo, { adminUsername: process.env.INJETAFLOW_ADMIN_USERNAME });

  const identificador = args.identificador ?? process.env.INJETAFLOW_RESET_USER ?? process.env.INJETAFLOW_ADMIN_EMAIL;
  let user;
  if (identificador) {
    const found = (await findLoginCandidates(repo, identificador)).filter(c => c.empresaId === empresaId);
    if (found.length > 1) throw new Error(`"${identificador}" corresponde a mais de um usuário. Use o e-mail.`);
    user = found[0];
  } else {
    const { items } = await repo.list<UserData>(USERS, empresaId, { filter: data => isAdminPerfil(data.perfil), sort: (a, b) => a.createdAt.localeCompare(b.createdAt), limit: 1 });
    user = items[0];
  }
  if (!user) {
    if (identificador) {
      const wanted = identificador.trim().toLowerCase();
      const excluidos = (await listDeletedUsers(repo, empresaId)).filter(u => [u.data.email, u.data.username, u.data.matricula].some(v => String(v ?? "").toLowerCase() === wanted));
      if (excluidos.length) {
        console.error(`"${identificador}" foi excluído. Restaure antes com: pnpm erp:restaurar-usuario ${identificador}`);
        process.exit(1);
      }
    }
    console.error(`Usuário ${identificador ? `"${identificador}"` : "administrador"} não encontrado em ${empresaId}. Rode "pnpm dev" uma vez para criar o administrador inicial.`);
    process.exit(1);
  }

  const patch: Partial<UserData> = { status: "Ativo" };
  if (novoUsername !== undefined) {
    await assertUsernameFree(repo, empresaId, novoUsername, user.id).catch(error => { throw new Error(error.message); });
    patch.username = normalizeUsername(novoUsername);
  }
  const senha = args.manterSenha ? null : fromEnv || generatePassword(16);
  if (senha) patch.senhaHash = hashUserPassword(senha);
  await repo.update<UserData>(USERS, empresaId, user.id, patch, systemActor(AUTOR_CLI));
  if (senha) await destroyUserSessions(repo, user.id);
  await audit(repo, empresaId, null, { autor: AUTOR_CLI, acao: "editar", modulo: "usuarios", registroId: user.id, resumo: `Linha de comando: ${[senha ? "senha redefinida" : null, patch.username ? `nome de usuário "${patch.username}"` : null, "reativado"].filter(Boolean).join(", ")} (${user.data.email})` });

  const username = patch.username ?? user.data.username;
  console.log(`Usuário atualizado: ${user.data.nome} · e-mail ${user.data.email} · usuário "${username}" · matrícula ${user.data.matricula}.`);
  if (!senha) console.log("Senha mantida.");
  else console.log(fromEnv ? "Senha: a definida em INJETAFLOW_ADMIN_PASSWORD (não exibida)." : `Nova senha (mostrada só agora): ${senha}`);
  console.log(`Entre com "${username}", "${user.data.email}" ou "${user.data.matricula}".`);
}

if (!process.env.VITEST) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
