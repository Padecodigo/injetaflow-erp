import { PERFIL_PRESETS } from "@shared/erp/modules";
import type { DataRepository } from "./repository";
import type { SessionUser, UserData } from "./types";
import { USERS } from "./auth";
import { generatePassword } from "./password";
import { createRecord, createMovement } from "./records";
import { registrarPontoDemonstracao } from "./ponto-demonstracao";
import { createUser, migrateUsernames } from "./users";
import { AUTOR_INICIALIZACAO } from "./audit";
import { PASSWORD_MIN_LENGTH } from "@shared/erp/account";
import { DEFAULT_EMPRESA_ID } from "./store";

export type SeedResult = { adminCreated: boolean; adminEmail?: string; generatedPassword?: string; demoSeeded: boolean; demoUsers?: string[]; generatedDemoPassword?: string };

/** Usuários de DEMONSTRAÇÃO (um por perfil) para testar permissões sem cadastrar ninguém. */
export const DEMO_USERS = [
  { nome: "Gestora Demonstração", email: "gestora.demo@wamovale.local", perfil: "Gestor", setor: "Administrativo", matricula: "DEMO-GES" },
  { nome: "Supervisor Demonstração", email: "supervisor.demo@wamovale.local", perfil: "Supervisor", setor: "Produção", matricula: "DEMO-SUP" },
  { nome: "Operador Demonstração", email: "operador.demo@wamovale.local", perfil: "Operador", setor: "Produção", matricula: "DEMO-OPE" },
  { nome: "Consulta Demonstração", email: "consulta.demo@wamovale.local", perfil: "Consulta", setor: "Comercial", matricula: "DEMO-CON" },
] as const;

/**
 * Cria o administrador inicial (se a empresa ainda não tiver usuários) e,
 * opcionalmente, dados de DEMONSTRAÇÃO marcados com `demo: true`.
 *
 * - E-mail: INJETAFLOW_ADMIN_EMAIL (padrão admin@wamovale.local)
 * - Senha: INJETAFLOW_ADMIN_PASSWORD; se ausente, é gerada e mostrada apenas
 *   no console local, uma única vez. Nunca é gravada em arquivo.
 * - Marcações de ponto de demonstração (P7-07): origem "Demonstração", nunca em produção por padrão
 *   (ver `deveSemearPontoDemo`).
 * - Demonstração: INJETAFLOW_SEED_DEMO=false desliga. Junto com os dados de exemplo são criados
 *   usuários demo (DEMO_USERS) com a senha INJETAFLOW_DEMO_PASSWORD ou uma senha gerada e
 *   mostrada só no console.
 */
export async function ensureSeed(repo: DataRepository, opts: { empresaId?: string; log?: (message: string) => void; env?: NodeJS.ProcessEnv } = {}): Promise<SeedResult> {
  const env = opts.env ?? process.env;
  const empresaId = opts.empresaId ?? DEFAULT_EMPRESA_ID;
  const log = opts.log ?? (message => console.log(message));
  const result: SeedResult = { adminCreated: false, demoSeeded: false };

  // migração automática do store: usuários antigos sem nome de usuário recebem um (admin inicial → "admin")
  const adminUsername = (env.INJETAFLOW_ADMIN_USERNAME || "admin").trim().toLowerCase();
  const { migrated } = await migrateUsernames(repo, { adminUsername });
  if (migrated > 0) log(`[InjetaFlow] Migração: ${migrated} usuário(s) receberam nome de usuário (o administrador inicial recebeu "${adminUsername}" se estava livre).`);

  const { total: users } = await repo.list<UserData>(USERS, empresaId, { includeDeleted: true, limit: 1 });
  let admin: SessionUser | null = null;
  if (users === 0) {
    const email = (env.INJETAFLOW_ADMIN_EMAIL || "admin@wamovale.local").trim().toLowerCase();
    const fromEnv = env.INJETAFLOW_ADMIN_PASSWORD;
    if (fromEnv && fromEnv.length < PASSWORD_MIN_LENGTH) throw new Error(`INJETAFLOW_ADMIN_PASSWORD precisa ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`);
    const senha = fromEnv || generatePassword(16);
    admin = await createUser(repo, null, empresaId, {
      nome: "Administrador Wamovale",
      email,
      username: adminUsername,
      senha,
      setor: "Administrativo",
      perfil: "Administrador",
      matricula: "ADM-0001",
      permissoes: PERFIL_PRESETS.Administrador,
      status: "Ativo",
    }, { autor: AUTOR_INICIALIZACAO });
    result.adminCreated = true;
    result.adminEmail = email;
    if (!fromEnv) {
      result.generatedPassword = senha;
      log(
        [
          "",
          "==================== InjetaFlow: administrador inicial ====================",
          `  Usuário: ${adminUsername}   (ou e-mail ${email}, ou matrícula ADM-0001)`,
          `  Senha gerada (mostrada só agora, troque em Meu perfil): ${senha}`,
          "  Para definir a senha você mesmo, use INJETAFLOW_ADMIN_PASSWORD antes do 1º start.",
          "===========================================================================",
          "",
        ].join("\n")
      );
    } else {
      log(`[InjetaFlow] Administrador inicial criado: usuário "${adminUsername}" / ${email} (senha definida por INJETAFLOW_ADMIN_PASSWORD).`);
    }
  }

  if (env.INJETAFLOW_SEED_DEMO !== "false") {
    const { total: ordens } = await repo.list("ordens", empresaId, { includeDeleted: true, limit: 1 });
    const { total: moldes } = await repo.list("moldes", empresaId, { includeDeleted: true, limit: 1 });
    if (ordens === 0 && moldes === 0) {
      const actor: SessionUser = admin ?? {
        id: "seed", empresaId, nome: "Carga de demonstração", email: "", setor: "Administrativo", perfil: "Administrador", matricula: "DEMO", permissoes: {}, status: "Ativo",
      };
      await seedDemo(repo, { ...actor, nome: "Carga de demonstração" }, { ponto: deveSemearPontoDemo(env) });
      if (result.adminCreated) {
        const fromEnvDemo = env.INJETAFLOW_DEMO_PASSWORD;
        if (fromEnvDemo && fromEnvDemo.length < PASSWORD_MIN_LENGTH) throw new Error(`INJETAFLOW_DEMO_PASSWORD precisa ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`);
        const demoSenha = fromEnvDemo || generatePassword(16);
        for (const u of DEMO_USERS) {
          await createUser(repo, null, empresaId, { ...u, senha: demoSenha, permissoes: PERFIL_PRESETS[u.perfil], status: "Ativo" }, { autor: AUTOR_INICIALIZACAO });
        }
        result.demoUsers = DEMO_USERS.map(u => u.email);
        if (!fromEnvDemo) result.generatedDemoPassword = demoSenha;
        log(
          [
            "",
            "------------- InjetaFlow: usuários de DEMONSTRAÇÃO (um por perfil) -------------",
            ...DEMO_USERS.map(u => `  ${u.perfil.padEnd(10)} ${u.email}  (usuário ${u.email.split("@")[0]})`),
            fromEnvDemo ? "  Senha: a definida em INJETAFLOW_DEMO_PASSWORD." : `  Senha (mostrada só agora): ${demoSenha}`,
            "--------------------------------------------------------------------------------",
            "",
          ].join("\n")
        );
      }
      result.demoSeeded = true;
      log("[InjetaFlow] Dados de DEMONSTRAÇÃO carregados (marcados como demo). Use INJETAFLOW_SEED_DEMO=false para não carregar.");
    }
  }
  return result;
}

const demo = { demo: true };

function inDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Dados fictícios para demonstração. Nada aqui representa cliente, pessoa ou valor real. */
export async function seedDemo(repo: DataRepository, actor: SessionUser, opts: { ponto?: boolean; now?: Date } = {}) {
  const c = (module: Parameters<typeof createRecord>[2], data: Record<string, unknown>) => createRecord(repo, actor, module, data, demo);

  await c("moldes", { codigo: "M-0001", descricao: "Tampa flip-top 28mm (demo)", produto: "Tampa flip-top 28mm", cavidades: 16, cavidadesAtivas: 16, ciclos: 120000, maquina: "INJ-07 · 180T", ultimaManutencao: inDays(-12), proximaAcao: "Lubrificação", status: "Em uso" });
  await c("moldes", { codigo: "M-0002", descricao: "Pote 250g (demo)", produto: "Pote 250g", cavidades: 4, cavidadesAtivas: 4, ciclos: 38000, maquina: "INJ-02 · 250T", ultimaManutencao: inDays(-30), proximaAcao: "Inspeção dimensional", status: "Disponível" });
  await c("moldes", { codigo: "M-0003", descricao: "Frasco 500ml (demo)", produto: "Frasco 500ml", cavidades: 8, cavidadesAtivas: 7, ciclos: 84000, maquina: "INJ-04 · 320T", ultimaManutencao: inDays(-45), proximaAcao: "Troca de inserto", status: "Atenção" });

  for (const [matricula, nome, cargo, setor, turno] of [
    ["MAT-0001", "Operador Demo 1", "Operador de injetora", "Produção", "1º turno (06–14)"],
    ["MAT-0002", "Operadora Demo 2", "Operadora de injetora", "Produção", "1º turno (06–14)"],
    ["MAT-0003", "Preparador Demo 3", "Preparador de máquinas", "Produção", "2º turno (14–22)"],
    ["MAT-0004", "Inspetora Demo 4", "Inspetora de qualidade", "Qualidade", "Administrativo (08–17)"],
    ["MAT-0005", "Técnico Demo 5", "Técnico de manutenção", "Manutenção", "Administrativo (08–17)"],
  ]) {
    await c("colaboradores", { matricula, nome, cargo, setor, turno, admissao: inDays(-400), status: "Ativo" });
  }

  await c("ordens", { cliente: "Cliente Demo A", produto: "Tampa flip-top 28mm", molde: "M-0001", maquina: "INJ-07 · 180T", quantidade: 20000, prioridade: "Alta", status: "Liberada", entrega: inDays(2) });
  await c("ordens", { cliente: "Cliente Demo B", produto: "Pote 250g", molde: "M-0002", maquina: "INJ-02 · 250T", quantidade: 8000, prioridade: "Normal", status: "Planejada", entrega: inDays(5) });
  await c("ordens", { cliente: "Cliente Demo C", produto: "Frasco 500ml", molde: "M-0003", maquina: "INJ-04 · 320T", quantidade: 12000, prioridade: "Urgente", status: "Em produção", entrega: inDays(-1) });

  await c("producao", { ordem: "OP-0001", matricula: "MAT-0001", quantidadeBoa: 3200, refugo: 60, turno: "1º turno" });
  await c("producao", { ordem: "OP-0003", matricula: "MAT-0002", quantidadeBoa: 2100, refugo: 45, turno: "1º turno" });

  await c("estoque", { codigo: "RES-PP-01", material: "Polipropileno homopolímero (demo)", categoria: "Resina", lote: "LT-DEMO-01", saldo: 5200, unidade: "kg", estoqueMinimo: 2000, local: "Silo 01", validade: inDays(200), status: "Normal" });
  await c("estoque", { codigo: "MB-BR-01", material: "Masterbatch branco (demo)", categoria: "Pigmento/Masterbatch", lote: "LT-DEMO-02", saldo: 180, unidade: "kg", estoqueMinimo: 250, local: "A-03-02", validade: inDays(90), status: "Reposição" });
  await c("estoque", { codigo: "EMB-CX-01", material: "Caixa de papelão 40x30 (demo)", categoria: "Embalagem", saldo: 1200, unidade: "un", estoqueMinimo: 300, local: "D-01-04", status: "Normal" });
  await createMovement(repo, actor, { item: "RES-PP-01", tipo: "Saída", quantidade: 200, documento: "OP-0001", observacoes: "Movimentação de demonstração" }, demo);

  await c("materia_prima", { codigo: "RES-PP-01", material: "Polipropileno homopolímero (demo)", tipo: "Resina virgem", fornecedor: "Fornecedor Demo A", lote: "LT-DEMO-01", quantidade: 5000, validade: inDays(200), status: "Liberado" });
  await c("materia_prima", { codigo: "RES-PCR-01", material: "PEAD reciclado (demo)", tipo: "Resina reciclada (PCR)", fornecedor: "Fornecedor Demo B", lote: "LT-DEMO-03", quantidade: 1500, validade: inDays(20), status: "Atenção" });
  await c("materia_prima", { codigo: "AD-UV-01", material: "Aditivo UV (demo)", tipo: "Aditivo", fornecedor: "Fornecedor Demo C", lote: "LT-DEMO-04", quantidade: 80, validade: inDays(300), status: "Quarentena" });

  await c("pigmentos", { codigo: "COR-BR-01", cor: "Branco tampa 28mm (demo)", masterbatch: "MB-BR-01", lote: "LT-DEMO-02", concentracao: 2, padrao: "Padrão interno demo", ultimoTeste: inDays(-3), status: "Aprovado" });
  await c("pigmentos", { codigo: "COR-AZ-01", cor: "Azul frasco (demo)", masterbatch: "MB-AZ-01", concentracao: 1.5, padrao: "Amostra demo", ultimoTeste: inDays(-1), status: "Em teste" });

  await c("qualidade", { tipo: "Inspeção", loteOrdem: "OP-0003", produto: "Frasco 500ml", responsavel: "Inspetora Demo 4", severidade: "Média", status: "Em análise", descricao: "Inspeção dimensional do primeiro lote (demonstração)." });
  await c("qualidade", { tipo: "Não conformidade", loteOrdem: "LT-DEMO-04", produto: "Aditivo UV", responsavel: "Inspetora Demo 4", severidade: "Alta", status: "Quarentena", descricao: "Laudo do fornecedor pendente (demonstração)." });

  await c("manutencao", { ativo: "INJ-07 · 180T", tipo: "Preventiva", prioridade: "Programada", responsavel: "Técnico Demo 5", previsao: inDays(3), status: "Aberta", descricao: "Inspeção de rosca e cilindro (demonstração)." });
  await c("manutencao", { ativo: "M-0003", tipo: "Ferramentaria", prioridade: "Alta", responsavel: "Técnico Demo 5", previsao: inDays(1), status: "Em execução", descricao: "Cavidade 8 bloqueada para troca de inserto (demonstração)." });

  await c("financeiro", { tipo: "Conta a receber", descricao: "Fatura demo OP-0001", centroCusto: "Injeção · Linha 01", valor: 18500, vencimento: inDays(15), status: "Em aberto" });
  await c("financeiro", { tipo: "Conta a pagar", descricao: "Compra demo de resina PP", centroCusto: "Suprimentos", valor: 9200.5, vencimento: inDays(7), status: "Em aberto" });
  await c("financeiro", { tipo: "Custo industrial", descricao: "Energia elétrica demo", centroCusto: "Utilidades", valor: 4100, vencimento: inDays(-2), status: "Pago" });

  await c("regras", { nome: "Alerta de estoque mínimo", modulo: "Estoque", condicao: "Saldo abaixo do estoque mínimo", responsavel: "Supervisor de estoque", status: "Ativa", detalhamento: "Regra de demonstração." });

  if (opts.ponto) await seedPontoDemo(repo, actor, opts.now ?? new Date());
}

/**
 * P7-07 (aceite do PR #7): o ERP não grava ponto (F0c, a origem oficial é o relógio REP). As marcações de
 * demonstração só existem fora de produção, ou quando `INJETAFLOW_SEED_DEMO_PONTO=true` (usado pelo E2E).
 * `INJETAFLOW_SEED_DEMO_PONTO=false` desliga também em desenvolvimento.
 */
export function deveSemearPontoDemo(env: NodeJS.ProcessEnv): boolean {
  if (env.INJETAFLOW_SEED_DEMO_PONTO === "true") return true;
  if (env.INJETAFLOW_SEED_DEMO_PONTO === "false") return false;
  return env.NODE_ENV !== "production";
}

/**
 * P7-04: marcações de demonstração em horários FIXOS do dia anterior (sempre no passado, então existem
 * a qualquer hora em que o seed rode), incluindo uma fora de sequência (DIVERGENTE). As de hoje entram
 * só se o horário já passou, para a tela de presença ter exemplo durante o expediente.
 */
export async function seedPontoDemo(repo: DataRepository, actor: SessionUser, now: Date) {
  const ontem = new Date(now);
  ontem.setDate(ontem.getDate() - 1);
  const em = (dia: Date, hh: number, mm: number) => {
    const d = new Date(dia);
    d.setHours(hh, mm, 0, 0);
    return d;
  };
  const p = (matricula: string, tipo: Parameters<typeof registrarPontoDemonstracao>[2]["tipo"], quando: Date) =>
    registrarPontoDemonstracao(repo, actor, { matricula, tipo, now: quando, demo: true });
  await p("MAT-0001", "Entrada", em(ontem, 5, 58));
  await p("MAT-0001", "Início de intervalo", em(ontem, 10, 0));
  await p("MAT-0001", "Fim de intervalo", em(ontem, 11, 0));
  await p("MAT-0001", "Saída", em(ontem, 14, 2));
  await p("MAT-0002", "Entrada", em(ontem, 6, 4));
  await p("MAT-0002", "Saída", em(ontem, 14, 0));
  await p("MAT-0002", "Saída", em(ontem, 14, 5)); // fora de sequência: gravada como DIVERGENTE, nunca recusada
  await p("MAT-0004", "Entrada", em(ontem, 8, 12));
  await p("MAT-0004", "Saída", em(ontem, 17, 3));
  const hoje = (hh: number, mm: number) => em(now, hh, mm);
  if (hoje(5, 58) <= now) await p("MAT-0001", "Entrada", hoje(5, 58));
  if (hoje(6, 4) <= now) await p("MAT-0002", "Entrada", hoje(6, 4));
  if (hoje(11, 0) <= now) await p("MAT-0002", "Início de intervalo", hoje(11, 0));
}
