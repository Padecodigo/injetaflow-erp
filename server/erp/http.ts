import type { Express } from "express";
import { hasPermission } from "@shared/erp/modules";
import { getUserFromToken, readSessionToken } from "./auth";
import { anexoPath } from "./publico";
import { dataDir, getRepository } from "./store";
import { idDaPasta } from "./trava";
import type { RecordData } from "./records";

/** Rotas HTTP fora do tRPC (download de anexos, que precisa de stream de arquivo). */
export function registerErpHttpRoutes(app: Express) {
  // B-04: as CLIs reconhecem o servidor DESTA pasta de dados na porta (id = hash do caminho, sem expor o caminho)
  app.get("/api/health/dados", (_req, res) => res.json({ dados: idDaPasta(dataDir()) }));
  app.get("/api/anexos/:id", async (req, res) => {
    const repo = getRepository();
    const user = await getUserFromToken(repo, readSessionToken(req));
    if (!user) return res.status(401).json({ error: "Sessão expirada ou inexistente." });
    if (!hasPermission(user, "solicitacoes", "ver")) return res.status(403).json({ error: "Sem permissão." });
    const record = await repo.get<RecordData>("solicitacoes", user.empresaId, req.params.id);
    const file = record?.data.anexoArquivo ? anexoPath(user.empresaId, String(record.data.anexoArquivo)) : null;
    if (!record || !file) return res.status(404).json({ error: "Anexo não encontrado." });
    res.setHeader("Cache-Control", "no-store");
    return res.download(file, String(record.data.anexoNome ?? "anexo"));
  });
}
