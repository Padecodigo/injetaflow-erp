import { TRPCError } from "@trpc/server";
import type { DataRepository, StoredRecord } from "./repository";
import type { SessionUser } from "./types";
import { actorOf, audit } from "./audit";
import { toCsv } from "./csv";
import { flatten, findByMatricula, type RecordData } from "./records";
import { localDateOf, normalizeText, todayIso } from "./text";

export const TIPOS_PONTO = ["Entrada", "Início de intervalo", "Fim de intervalo", "Saída"] as const;
export type TipoPonto = (typeof TIPOS_PONTO)[number];
export const ORIGENS_PONTO = ["GPS", "Rede local", "Manual"] as const;
export type OrigemPonto = (typeof ORIGENS_PONTO)[number];

export type EstadoPresenca = "Presente" | "Em intervalo" | "Saiu" | "Ausente" | "Férias" | "Afastado";

/** Próximo estado permitido a partir da última batida do dia. */
export function nextAllowed(last: TipoPonto | null): TipoPonto[] {
  switch (last) {
    case null:
    case "Saída":
      return ["Entrada"];
    case "Entrada":
    case "Fim de intervalo":
      return ["Início de intervalo", "Saída"];
    case "Início de intervalo":
      return ["Fim de intervalo"];
    default:
      return ["Entrada"];
  }
}

export function stateFromLast(last: TipoPonto | null): EstadoPresenca {
  if (last === "Entrada" || last === "Fim de intervalo") return "Presente";
  if (last === "Início de intervalo") return "Em intervalo";
  if (last === "Saída") return "Saiu";
  return "Ausente";
}

async function eventsOf(repo: DataRepository, empresaId: string, filter: (data: RecordData) => boolean) {
  const { items } = await repo.list<RecordData>("ponto", empresaId, { filter, sort: (a, b) => String(a.data.dataHora).localeCompare(String(b.data.dataHora)) });
  return items;
}

export async function registrarPonto(
  repo: DataRepository,
  user: SessionUser,
  input: { matricula: string; tipo: TipoPonto; origem: OrigemPonto; observacao?: string; now?: Date; demo?: boolean }
) {
  const matricula = input.matricula.trim().toUpperCase();
  const pessoa = await findByMatricula(repo, user.empresaId, matricula);
  if (!pessoa) throw new TRPCError({ code: "BAD_REQUEST", message: `Matrícula "${matricula}" não encontrada ou inativa.` });
  const now = input.now ?? new Date();
  const day = todayIso(now);
  const today = await eventsOf(repo, user.empresaId, data => normalizeText(data.matricula) === normalizeText(matricula) && localDateOf(String(data.dataHora)) === day);
  const last = (today.at(-1)?.data.tipo as TipoPonto | undefined) ?? null;
  const allowed = nextAllowed(last);
  if (!allowed.includes(input.tipo)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `Batida fora de sequência: após "${last ?? "nenhuma batida"}" o próximo registro deve ser ${allowed.join(" ou ")}.` });
  }
  // A captura real de GPS/rede local ainda não existe no MVP: a origem é declarada e marcada como simulada.
  const simulado = input.origem === "Manual" ? "não (manual)" : "sim";
  const record = await repo.insert<RecordData>("ponto", user.empresaId, {
    matricula,
    nome: pessoa.nome,
    tipo: input.tipo,
    origem: input.origem,
    simulado,
    dataHora: now.toISOString(),
    observacao: input.observacao?.trim() || undefined,
    registradoPor: user.nome,
  }, { actor: actorOf(user), demo: input.demo });
  await audit(repo, user.empresaId, user, { acao: "ponto", modulo: "rh", registroId: record.id, resumo: `${input.tipo} de ${pessoa.nome} (${matricula}) · ${input.origem}` });
  return flatten(record);
}

export async function presenca(repo: DataRepository, empresaId: string, date = todayIso()) {
  const { items: colaboradores } = await repo.list<RecordData>("colaboradores", empresaId, {
    filter: data => data.status !== "Desligado",
    sort: (a, b) => String(a.data.nome).localeCompare(String(b.data.nome), "pt-BR"),
  });
  const events = await eventsOf(repo, empresaId, data => localDateOf(String(data.dataHora)) === date);
  const byMatricula = new Map<string, StoredRecord<RecordData>[]>();
  for (const event of events) {
    const key = normalizeText(event.data.matricula);
    byMatricula.set(key, [...(byMatricula.get(key) ?? []), event]);
  }
  const pessoas = colaboradores.map(colaborador => {
    const list = byMatricula.get(normalizeText(colaborador.data.matricula)) ?? [];
    const last = list.at(-1);
    let estado: EstadoPresenca = stateFromLast((last?.data.tipo as TipoPonto | undefined) ?? null);
    if (colaborador.data.status === "Férias") estado = "Férias";
    if (colaborador.data.status === "Afastado") estado = "Afastado";
    const entrada = list.find(event => event.data.tipo === "Entrada");
    return {
      id: colaborador.id,
      matricula: String(colaborador.data.matricula),
      nome: String(colaborador.data.nome),
      cargo: String(colaborador.data.cargo ?? ""),
      setor: String(colaborador.data.setor ?? ""),
      turno: String(colaborador.data.turno ?? ""),
      estado,
      entrada: entrada ? String(entrada.data.dataHora) : null,
      ultimaBatida: last ? String(last.data.tipo) : null,
      ultimaOrigem: last ? String(last.data.origem) : null,
      ultimaHora: last ? String(last.data.dataHora) : null,
      demo: colaborador.demo ?? false,
    };
  });
  const count = (state: EstadoPresenca) => pessoas.filter(pessoa => pessoa.estado === state).length;
  const origens = events.reduce<Record<string, number>>((acc, event) => {
    const key = String(event.data.origem);
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  return {
    date,
    pessoas,
    totais: {
      escalados: pessoas.filter(pessoa => pessoa.estado !== "Férias" && pessoa.estado !== "Afastado").length,
      presentes: count("Presente"),
      intervalo: count("Em intervalo"),
      sairam: count("Saiu"),
      ausentes: count("Ausente"),
      afastados: count("Férias") + count("Afastado"),
      batidas: events.length,
      origens,
    },
  };
}

function eachDay(inicio: string, fim: string): string[] {
  const days: string[] = [];
  const cursor = new Date(`${inicio}T12:00:00`);
  const end = new Date(`${fim}T12:00:00`);
  while (cursor <= end && days.length < 93) {
    days.push(todayIso(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

const hhmm = (iso?: string | null) => (iso ? new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "");
export const formatMinutes = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

export type LinhaRelatorio = {
  data: string;
  matricula: string;
  nome: string;
  setor: string;
  entrada: string | null;
  inicioIntervalo: string | null;
  fimIntervalo: string | null;
  saida: string | null;
  minutosTrabalhados: number;
  minutosIntervalo: number;
  origens: string;
  simulado: boolean;
  situacao: "Regular" | "Incompleto" | "Ausente" | "Sem expediente";
};

export async function relatorio(repo: DataRepository, empresaId: string, input: { inicio: string; fim: string; matricula?: string }) {
  if (input.fim < input.inicio) throw new TRPCError({ code: "BAD_REQUEST", message: "A data final deve ser posterior à inicial." });
  const days = eachDay(input.inicio, input.fim);
  const { items: colaboradores } = await repo.list<RecordData>("colaboradores", empresaId, {
    filter: data => data.status !== "Desligado" && (!input.matricula || normalizeText(data.matricula) === normalizeText(input.matricula)),
    sort: (a, b) => String(a.data.nome).localeCompare(String(b.data.nome), "pt-BR"),
  });
  const events = await eventsOf(repo, empresaId, data => {
    const day = localDateOf(String(data.dataHora));
    return day >= input.inicio && day <= input.fim;
  });
  const linhas: LinhaRelatorio[] = [];
  for (const day of days) {
    const weekday = new Date(`${day}T12:00:00`).getDay();
    for (const colaborador of colaboradores) {
      const list = events.filter(event => normalizeText(event.data.matricula) === normalizeText(colaborador.data.matricula) && localDateOf(String(event.data.dataHora)) === day);
      const first = (tipo: TipoPonto) => list.find(event => event.data.tipo === tipo)?.data.dataHora as string | undefined;
      const lastOf = (tipo: TipoPonto) => [...list].reverse().find(event => event.data.tipo === tipo)?.data.dataHora as string | undefined;
      const entrada = first("Entrada") ?? null;
      const saida = lastOf("Saída") ?? null;
      let intervalo = 0;
      let open: string | null = null;
      for (const event of list) {
        if (event.data.tipo === "Início de intervalo") open = String(event.data.dataHora);
        if (event.data.tipo === "Fim de intervalo" && open) {
          intervalo += (new Date(String(event.data.dataHora)).getTime() - new Date(open).getTime()) / 60000;
          open = null;
        }
      }
      const trabalhado = entrada && saida ? Math.max(0, (new Date(saida).getTime() - new Date(entrada).getTime()) / 60000 - intervalo) : 0;
      const situacao: LinhaRelatorio["situacao"] = list.length === 0 ? (weekday === 0 || weekday === 6 ? "Sem expediente" : "Ausente") : entrada && saida && !open ? "Regular" : "Incompleto";
      linhas.push({
        data: day,
        matricula: String(colaborador.data.matricula),
        nome: String(colaborador.data.nome),
        setor: String(colaborador.data.setor ?? ""),
        entrada,
        inicioIntervalo: first("Início de intervalo") ?? null,
        fimIntervalo: first("Fim de intervalo") ?? null,
        saida,
        minutosTrabalhados: Math.round(trabalhado),
        minutosIntervalo: Math.round(intervalo),
        origens: Array.from(new Set(list.map(event => String(event.data.origem)))).join(", "),
        simulado: list.some(event => event.data.simulado === "sim"),
        situacao,
      });
    }
  }
  return { inicio: input.inicio, fim: input.fim, linhas };
}

export async function relatorioCsv(repo: DataRepository, empresaId: string, input: { inicio: string; fim: string; matricula?: string }) {
  const { linhas } = await relatorio(repo, empresaId, input);
  const headers = ["Data", "Matrícula", "Colaborador", "Setor", "Entrada", "Início intervalo", "Fim intervalo", "Saída", "Horas trabalhadas", "Intervalo", "Origem", "Origem simulada", "Situação"];
  const rows = linhas.map(linha => [
    linha.data.split("-").reverse().join("/"),
    linha.matricula,
    linha.nome,
    linha.setor,
    hhmm(linha.entrada),
    hhmm(linha.inicioIntervalo),
    hhmm(linha.fimIntervalo),
    hhmm(linha.saida),
    formatMinutes(linha.minutosTrabalhados),
    formatMinutes(linha.minutosIntervalo),
    linha.origens,
    linha.simulado ? "sim" : "não",
    linha.situacao,
  ]);
  const suffix = input.matricula ? `-${input.matricula}` : "";
  return { filename: `relatorio-ponto-${input.inicio}-a-${input.fim}${suffix}.csv`, csv: toCsv(headers, rows), count: linhas.length };
}

export async function historico(repo: DataRepository, empresaId: string, matricula: string) {
  const wanted = normalizeText(matricula);
  const { items: colaboradores } = await repo.list<RecordData>("colaboradores", empresaId, { filter: data => normalizeText(data.matricula) === wanted, limit: 1 });
  const { items: batidas } = await repo.list<RecordData>("ponto", empresaId, {
    filter: data => normalizeText(data.matricula) === wanted,
    sort: (a, b) => String(b.data.dataHora).localeCompare(String(a.data.dataHora)),
    limit: 300,
  });
  const { items: ocorrencias } = await repo.list<RecordData>("ocorrencias", empresaId, { filter: data => normalizeText(data.matricula) === wanted, limit: 200 });
  const { items: apontamentos } = await repo.list<RecordData>("producao", empresaId, { filter: data => normalizeText(data.matricula) === wanted, limit: 200 });
  return {
    colaborador: colaboradores[0] ? flatten(colaboradores[0]) : null,
    batidas: batidas.map(flatten),
    ocorrencias: ocorrencias.map(flatten),
    apontamentos: apontamentos.map(flatten),
  };
}
