import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { MODULES } from "@shared/erp/modules";
import { TELEFONE_MENSAGEM, telefoneError } from "@shared/erp/contato";
import type { DataRepository } from "./repository";
import { audit } from "./audit";
import { dataDir } from "./store";
import type { RecordData } from "./records";

/**
 * Spec Segurança LGPD (R4/R5, N-12): o envio de currículo pelo portal fica DESLIGADO até existirem aviso de
 * privacidade, base legal, retenção e expurgo. Só liga com PORTAL_CURRICULOS_ATIVO=true no servidor (padrão false).
 * O cliente lê a flag pela config pública (publico.config); a recusa vale no servidor mesmo sem a UI.
 */
export const CURRICULOS_DESATIVADOS_MSG = "O envio de currículos está temporariamente desativado. Este é um ambiente de demonstração.";
export function curriculosAtivo(): boolean {
  return ["true", "1"].includes(String(process.env.PORTAL_CURRICULOS_ATIVO ?? "").trim().toLowerCase());
}
export function assertCurriculosAtivo(tipo: unknown) {
  if (tipo === "Currículo" && !curriculosAtivo()) throw new TRPCError({ code: "FORBIDDEN", message: CURRICULOS_DESATIVADOS_MSG });
}

export const MAX_ANEXO_BYTES = 5 * 1024 * 1024;
const EXTENSOES = ["pdf", "doc", "docx", "dwg", "dxf", "step", "stp", "jpg", "jpeg", "png"] as const;

const anexoSchema = z.object({
  nome: z.string().trim().min(1).max(160),
  base64: z.string().min(1),
});

// N06: telefone com formato validado (vazio = não informado)
const telefoneSchema = z.string().trim().max(40).optional().refine(value => !telefoneError(value), { message: TELEFONE_MENSAGEM });

export const solicitacaoSchema = z.discriminatedUnion("tipo", [
  z.object({
    tipo: z.literal("Cotação"),
    nome: z.string().trim().min(2, "Informe seu nome").max(120),
    empresa: z.string().trim().min(2, "Informe a empresa").max(160),
    email: z.string().trim().toLowerCase().email("E-mail inválido").max(200),
    telefone: telefoneSchema,
    necessidade: z.string().trim().max(200),
    etapa: z.string().trim().max(200),
    volume: z.string().trim().max(200),
    material: z.string().trim().max(200),
    mensagem: z.string().trim().max(4000).optional(),
    consentimento: z.literal(true, { message: "É preciso autorizar o uso dos dados para retorno." }),
    website: z.string().max(0).optional(),
    anexo: anexoSchema.optional(),
  }),
  z.object({
    tipo: z.literal("Contato"),
    nome: z.string().trim().min(2, "Informe seu nome").max(120),
    empresa: z.string().trim().max(160).optional(),
    email: z.string().trim().toLowerCase().email("E-mail inválido").max(200),
    telefone: telefoneSchema,
    assunto: z.string().trim().min(2, "Informe o assunto").max(200),
    mensagem: z.string().trim().min(5, "Escreva sua mensagem").max(4000),
    consentimento: z.literal(true, { message: "É preciso autorizar o uso dos dados para retorno." }),
    website: z.string().max(0).optional(),
  }),
  z.object({
    tipo: z.literal("Currículo"),
    nome: z.string().trim().min(2, "Informe seu nome").max(120),
    email: z.string().trim().toLowerCase().email("E-mail inválido").max(200),
    telefone: telefoneSchema,
    area: z.string().trim().min(2, "Informe a área de interesse").max(200),
    mensagem: z.string().trim().max(4000).optional(),
    consentimento: z.literal(true, { message: "É preciso autorizar o uso dos dados para o processo seletivo." }),
    website: z.string().max(0).optional(),
    anexo: anexoSchema,
  }),
]);

export type SolicitacaoInput = z.infer<typeof solicitacaoSchema>;

// limite simples por IP (memória do processo)
const hits = new Map<string, number[]>();
export function checkPublicRate(ip: string, now = Date.now(), max = 8, windowMs = 10 * 60 * 1000) {
  const recent = (hits.get(ip) ?? []).filter(ts => now - ts < windowMs);
  if (recent.length >= max) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Muitos envios em sequência. Tente novamente em alguns minutos." });
  hits.set(ip, [...recent, now]);
}
export function resetPublicRate() {
  hits.clear();
}

function saveAnexo(empresaId: string, anexo: { nome: string; base64: string }, allowed: readonly string[]) {
  const ext = anexo.nome.split(".").pop()?.toLowerCase() ?? "";
  if (!allowed.includes(ext)) throw new TRPCError({ code: "BAD_REQUEST", message: `Formato de arquivo não aceito (.${ext}). Use: ${allowed.join(", ")}.` });
  const content = anexo.base64.replace(/^data:[^;]+;base64,/, "");
  const buffer = Buffer.from(content, "base64");
  if (buffer.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Arquivo vazio." });
  if (buffer.length > MAX_ANEXO_BYTES) throw new TRPCError({ code: "BAD_REQUEST", message: "Arquivo acima de 5 MB." });
  const safeName = anexo.nome.replace(/[^\w.-]+/g, "_").slice(-80);
  const fileName = `${randomUUID()}.${ext}`;
  const dir = path.join(dataDir(), "uploads", empresaId.replace(/[^\w-]/g, ""));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, fileName), buffer, { mode: 0o600 });
  return { anexo: `${safeName} (${Math.max(1, Math.round(buffer.length / 1024))} KB)`, anexoArquivo: fileName, anexoNome: safeName };
}

export function anexoPath(empresaId: string, fileName: string): string | null {
  if (!/^[0-9a-f-]{36}\.[a-z0-9]+$/.test(fileName)) return null;
  const full = path.join(dataDir(), "uploads", empresaId.replace(/[^\w-]/g, ""), fileName);
  return fs.existsSync(full) ? full : null;
}

export async function enviarSolicitacao(repo: DataRepository, empresaId: string, input: SolicitacaoInput) {
  // defesa em profundidade: nada é lido do store nem gravado em disco para currículo com a flag desligada
  assertCurriculosAtivo(input.tipo);
  if (input.website) throw new TRPCError({ code: "BAD_REQUEST", message: "Envio inválido." });
  const mod = MODULES.solicitacoes;
  const { items } = await repo.list<RecordData>("solicitacoes", empresaId, { includeDeleted: true });
  const max = items.reduce((acc, item) => Math.max(acc, Number(String(item.data.codigo ?? "").replace(/\D/g, "")) || 0), 0);
  const codigo = `${mod.autoCode!.prefix}${String(max + 1).padStart(4, "0")}`;
  const data: RecordData = { codigo, tipo: input.tipo, nome: input.nome, email: input.email, telefone: input.telefone || undefined, status: "Novo", consentimento: new Date().toISOString() };
  if (input.tipo === "Cotação") {
    Object.assign(data, {
      empresa: input.empresa,
      assunto: input.necessidade,
      mensagem: input.mensagem || undefined,
      detalhes: [`Necessidade: ${input.necessidade}`, `Etapa: ${input.etapa}`, `Volume: ${input.volume}`, `Material: ${input.material}`].join("\n"),
    });
    if (input.anexo) Object.assign(data, saveAnexo(empresaId, input.anexo, EXTENSOES));
  } else if (input.tipo === "Contato") {
    Object.assign(data, { empresa: input.empresa || undefined, assunto: input.assunto, mensagem: input.mensagem });
  } else {
    Object.assign(data, { assunto: input.area, mensagem: input.mensagem || undefined, detalhes: `Área de interesse: ${input.area}` });
    Object.assign(data, saveAnexo(empresaId, input.anexo, ["pdf", "doc", "docx"]));
  }
  const record = await repo.insert<RecordData>("solicitacoes", empresaId, data, { actor: null });
  await audit(repo, empresaId, null, { acao: "criar", modulo: "solicitacoes", registroId: record.id, resumo: `${input.tipo} recebida pelo site (${codigo})` });
  return { protocolo: codigo };
}
