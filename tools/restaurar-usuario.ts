/**
 * Restaura um usuário do ERP local que foi excluído logicamente (ex.: administrador excluído
 * por engano). O registro nunca é apagado de verdade; este comando apenas o devolve às listas.
 * Recusa com o servidor no ar (B-04: o servidor mantém os dados em memória): pare o servidor antes.
 *
 * Uso:
 *   pnpm erp:restaurar-usuario --listar               lista os usuários excluídos
 *   pnpm erp:restaurar-usuario <identificador>        e-mail, nome de usuário, matrícula ou id
 *
 * Recusa se o e-mail ou a matrícula já estiverem com outra pessoa ativa. Se o nome de usuário
 * estiver em uso, gera outro livre. A senha e o status anteriores são mantidos; para trocar a
 * senha depois, use `pnpm erp:reset-senha <identificador>`. Tudo vai para a auditoria com o
 * autor "Linha de comando". Empresa: INJETAFLOW_EMPRESA (padrão: a empresa padrão).
 */
import "dotenv/config";
import { DEFAULT_EMPRESA_ID } from "../server/erp/store";
import { abrirStoreParaGravar, confirmarGravacao } from "./cli-store";
import { USERS } from "../server/erp/auth";
import { AUTOR_CLI } from "../server/erp/audit";
import { formatBrasilia, listDeletedUsers, migrateUsernames, restoreUser } from "../server/erp/users";

export function parseRestoreArgs(argv: string[]) {
  let identificador: string | undefined;
  let listar = false;
  for (const arg of argv) {
    if (arg === "--") continue;
    if (arg === "--listar" || arg === "-l") listar = true;
    else if (!arg.startsWith("-") && !identificador) identificador = arg;
    else throw new Error(`Argumento desconhecido: ${arg}`);
  }
  if (!listar && !identificador) throw new Error("Informe o e-mail, nome de usuário, matrícula ou id do usuário excluído (ou --listar).");
  return { identificador, listar };
}

async function main() {
  const args = parseRestoreArgs(process.argv.slice(2));
  const empresaId = process.env.INJETAFLOW_EMPRESA || DEFAULT_EMPRESA_ID;
  const repo = await abrirStoreParaGravar("erp:restaurar-usuario");
  await migrateUsernames(repo, { adminUsername: process.env.INJETAFLOW_ADMIN_USERNAME });
  if (args.listar) {
    const excluidos = await listDeletedUsers(repo, empresaId);
    if (!excluidos.length) {
      console.log(`Nenhum usuário excluído em ${empresaId}.`);
      return;
    }
    console.log(`Usuários excluídos em ${empresaId}:`);
    for (const u of excluidos) console.log(`  ${u.id} · ${u.data.nome} (${u.data.perfil}) · ${u.data.email} · ${u.data.username ? `usuário "${u.data.username}"` : "sem nome de usuário"} · matrícula ${u.data.matricula} · excluído em ${formatBrasilia(u.deletedAt)} por ${u.deletedBy?.nome ?? "?"}`);
    return;
  }
  const out = await restoreUser(repo, empresaId, args.identificador!, { autor: AUTOR_CLI });
  await confirmarGravacao(async lido => Boolean(await lido.get(USERS, empresaId, out.user.id)));
  console.log(`Usuário restaurado: ${out.user.nome} (${out.user.perfil}) · e-mail ${out.user.email} · usuário "${out.user.username}" · matrícula ${out.user.matricula} · status ${out.user.status}.`);
  if (out.usernameMotivo === "em uso") console.log(`O nome de usuário anterior ("${out.usernameAnterior}") estava em uso; o novo é "${out.user.username}".`);
  else if (out.usernameMotivo === "vazio") console.log(`O usuário não tinha nome de usuário; recebeu "${out.user.username}" (derivado do e-mail).`);
  console.log("A senha anterior foi mantida. Para trocá-la: pnpm erp:reset-senha " + out.user.matricula);
}

if (!process.env.VITEST) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
