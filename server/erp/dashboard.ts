import type { DataRepository } from "./repository";
import { listRecords, type RecordData } from "./records";
import { presenca } from "./rh";
import { localDateOf, todayIso } from "./text";

export type Periodo = "hoje" | "7d" | "30d";

export function periodStart(periodo: Periodo, now = new Date()): string {
  const days = periodo === "hoje" ? 0 : periodo === "7d" ? 6 : 29;
  const start = new Date(now);
  start.setDate(start.getDate() - days);
  return todayIso(start);
}

const ATIVAS = ["Liberada", "Em produção", "Pausada"];
const FECHADAS = ["Concluída", "Cancelada"];

/** Indicadores do dashboard calculados a partir dos dados gravados (nada fixo). */
export async function dashboardSummary(repo: DataRepository, empresaId: string, periodo: Periodo = "hoje", now = new Date()) {
  const inicio = periodStart(periodo, now);
  const hoje = todayIso(now);
  const [ordensAll, apont, qualidade, manutencao, estoque, materia, rh] = await Promise.all([
    listRecords(repo, empresaId, "ordens", { pageSize: 100, page: 1 }).then(async first => {
      const items = [...first.items];
      for (let page = 2; page <= first.pages; page++) items.push(...(await listRecords(repo, empresaId, "ordens", { pageSize: 100, page })).items);
      return items;
    }),
    repo.list<RecordData>("producao", empresaId, { filter: (_d, r) => localDateOf(r.createdAt) >= inicio }),
    repo.list<RecordData>("qualidade", empresaId, { filter: d => !["Liberado", "Aprovado", "Encerrado", "Reprovado"].includes(String(d.status)) }),
    repo.list<RecordData>("manutencao", empresaId, { filter: d => !["Concluída", "Cancelada"].includes(String(d.status)) }),
    repo.list<RecordData>("estoque", empresaId, { filter: d => Number(d.estoqueMinimo ?? 0) > 0 && Number(d.saldo ?? 0) < Number(d.estoqueMinimo ?? 0) }),
    repo.list<RecordData>("materia_prima", empresaId, {
      filter: d => {
        if (!d.validade) return false;
        const limite = new Date(now);
        limite.setDate(limite.getDate() + 30);
        return String(d.validade) <= todayIso(limite) && Number(d.quantidade ?? 0) > 0;
      },
    }),
    presenca(repo, empresaId, hoje),
  ]);

  const boas = apont.items.reduce((sum, item) => sum + (Number(item.data.quantidadeBoa) || 0), 0);
  const refugo = apont.items.reduce((sum, item) => sum + (Number(item.data.refugo) || 0), 0);
  const ativas = ordensAll.filter(ordem => ATIVAS.includes(String(ordem.status)));
  const atrasadas = ordensAll.filter(ordem => !FECHADAS.includes(String(ordem.status)) && String(ordem.entrega ?? "") < hoje && ordem.entrega);
  const urgentes = ativas.filter(ordem => ordem.prioridade === "Urgente").length;

  // série: por hora (hoje) ou por dia (7d/30d)
  const buckets = new Map<string, number>();
  if (periodo === "hoje") {
    for (let hour = 0; hour < 24; hour += 2) buckets.set(`${String(hour).padStart(2, "0")}h`, 0);
    for (const item of apont.items) {
      const hour = new Date(item.createdAt).getHours();
      const key = `${String(hour - (hour % 2)).padStart(2, "0")}h`;
      buckets.set(key, (buckets.get(key) ?? 0) + (Number(item.data.quantidadeBoa) || 0));
    }
  } else {
    const cursor = new Date(`${inicio}T12:00:00`);
    while (todayIso(cursor) <= hoje) {
      buckets.set(todayIso(cursor).slice(5).split("-").reverse().join("/"), 0);
      cursor.setDate(cursor.getDate() + 1);
    }
    for (const item of apont.items) {
      const key = localDateOf(item.createdAt).slice(5).split("-").reverse().join("/");
      buckets.set(key, (buckets.get(key) ?? 0) + (Number(item.data.quantidadeBoa) || 0));
    }
  }

  const alertas: { titulo: string; detalhe: string; tom: "red" | "orange" | "blue"; href: string }[] = [];
  for (const ordem of atrasadas.slice(0, 3)) alertas.push({ titulo: `${String(ordem.codigo)} atrasada`, detalhe: `${String(ordem.produto)} · entrega ${String(ordem.entrega).split("-").reverse().join("/")}`, tom: "red", href: "/ordens" });
  for (const item of qualidade.items.filter(i => i.data.status === "Quarentena" || i.data.severidade === "Crítica").slice(0, 3)) alertas.push({ titulo: `${String(item.data.codigo)} · ${String(item.data.status)}`, detalhe: `${String(item.data.loteOrdem)} · ${String(item.data.produto)}`, tom: "red", href: "/qualidade" });
  for (const item of estoque.items.slice(0, 3)) alertas.push({ titulo: `Estoque baixo: ${String(item.data.codigo)}`, detalhe: `${String(item.data.material)} · saldo ${String(item.data.saldo)} ${String(item.data.unidade ?? "")} (mín. ${String(item.data.estoqueMinimo)})`, tom: "blue", href: "/estoque" });
  for (const item of materia.items.slice(0, 3)) alertas.push({ titulo: `Validade próxima: ${String(item.data.lote)}`, detalhe: `${String(item.data.material)} · vence ${String(item.data.validade).split("-").reverse().join("/")}`, tom: "orange", href: "/materia-prima" });
  for (const item of manutencao.items.filter(i => i.data.prioridade === "Parada imediata").slice(0, 3)) alertas.push({ titulo: `${String(item.data.codigo)} · parada imediata`, detalhe: `${String(item.data.ativo)} · ${String(item.data.status)}`, tom: "orange", href: "/manutencao" });

  return {
    periodo,
    inicio,
    geradoEm: now.toISOString(),
    indicadores: {
      producaoBoa: boas,
      refugo,
      refugoPct: boas + refugo > 0 ? Math.round((refugo / (boas + refugo)) * 1000) / 10 : 0,
      apontamentos: apont.items.length,
      ordensAtivas: ativas.length,
      ordensUrgentes: urgentes,
      ordensAtrasadas: atrasadas.length,
      ordensAbertas: ordensAll.filter(ordem => !FECHADAS.includes(String(ordem.status))).length,
      qualidadeAbertos: qualidade.items.length,
      manutencaoAbertas: manutencao.items.length,
      estoqueBaixo: estoque.items.length,
      validadeProxima: materia.items.length,
      presentes: rh.totais.presentes,
      escalados: rh.totais.escalados,
    },
    serie: Array.from(buckets.entries()).map(([label, value]) => ({ label, value })),
    ordens: ativas
      .concat(ordensAll.filter(ordem => ordem.status === "Planejada"))
      .slice(0, 6)
      .map(ordem => ({ id: ordem.id, codigo: ordem.codigo, produto: ordem.produto, maquina: ordem.maquina, molde: ordem.molde, progresso: ordem.progresso, status: ordem.status, entrega: ordem.entrega, demo: ordem.demo })),
    alertas,
  };
}
