import { TRPCClientError } from "@trpc/client";
import { toast } from "sonner";

/** Mensagem legível de erro vinda do tRPC/servidor. */
export function errorMessage(error: unknown): string {
  if (error instanceof TRPCClientError) {
    const code = (error.data as { code?: string } | undefined)?.code;
    if (code === "FORBIDDEN") return "Seu perfil não tem permissão para esta ação.";
    if (code === "UNAUTHORIZED") return error.message || "Sessão expirada. Entre novamente.";
    try {
      const parsed = JSON.parse(error.message) as { message?: string }[];
      if (Array.isArray(parsed)) return parsed.map(item => item.message).filter(Boolean).join("; ");
    } catch {
      // mensagem já é texto
    }
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return "Não foi possível concluir a operação.";
}

export function toastError(title: string, error: unknown) {
  toast.error(title, { description: errorMessage(error) });
}

/** Baixa um CSV gerado pelo servidor (B07). */
export function downloadFile(filename: string, content: string, type = "text/csv;charset=utf-8") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    reader.readAsDataURL(file);
  });
}
