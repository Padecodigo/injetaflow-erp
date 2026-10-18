import { describe, expect, it } from "vitest";
import { emSecaoCritica, filasAtivas } from "../../_core/secaoCritica";
import { MUTATIONS_FORA_DA_SECAO } from "../../_core/trpc";
import { callerFor, setup } from "./helpers";

/**
 * Auditoria de frontend (item de backend): códigos e IDs únicos não se sustentavam com duas criações no
 * mesmo instante. Cada `await` entre "ler o próximo código / conferir se já existe" e o insert deixava
 * outra requisição passar, gerando OP-0001 duas vezes, o mesmo código de estoque duas vezes ou o mesmo
 * e-mail em dois usuários. Correção: toda mutation que grava roda numa seção crítica (checagem + insert
 * sem intercalação).
 */
const tick = () => new Promise(r => setTimeout(r, 1));

describe("seção crítica (unitário)", () => {
  it("executa em ordem FIFO, sem sobreposição", async () => {
    const eventos: string[] = [];
    let dentro = 0;
    let maximo = 0;
    await Promise.all(
      [1, 2, 3, 4, 5].map(n =>
        emSecaoCritica("t", async () => {
          dentro += 1;
          maximo = Math.max(maximo, dentro);
          eventos.push(`in${n}`);
          await tick();
          eventos.push(`out${n}`);
          dentro -= 1;
        })
      )
    );
    expect(maximo).toBe(1);
    expect(eventos).toEqual(["in1", "out1", "in2", "out2", "in3", "out3", "in4", "out4", "in5", "out5"]);
    expect(filasAtivas()).toBe(0);
  });

  it("um erro não trava a fila e é devolvido a quem chamou", async () => {
    const falha = emSecaoCritica("e", async () => {
      throw new Error("boom");
    });
    const depois = emSecaoCritica("e", async () => "ok");
    await expect(falha).rejects.toThrow("boom");
    await expect(depois).resolves.toBe("ok");
  });

  it("é reentrante no mesmo fluxo (sem deadlock) e chaves diferentes não esperam uma pela outra", async () => {
    await expect(emSecaoCritica("r", () => emSecaoCritica("r", async () => 42))).resolves.toBe(42);
    let liberar!: () => void;
    const segura = emSecaoCritica("a", () => new Promise<void>(r => (liberar = r)));
    await expect(emSecaoCritica("b", async () => "livre")).resolves.toBe("livre");
    liberar();
    await segura;
  });

  it("o login fica fora (público, sujeito a força bruta: não pode travar as escritas)", () => {
    expect(MUTATIONS_FORA_DA_SECAO.has("auth.login")).toBe(true);
  });
});

describe("criações simultâneas não duplicam código nem chave única (integração, via tRPC)", () => {
  it("20 ordens ao mesmo tempo recebem 20 códigos automáticos diferentes", async () => {
    const { admin } = await setup();
    await admin.caller.records.create({ module: "moldes", data: { codigo: "M-0100", descricao: "Tampa 28", cavidades: 8, status: "Disponível" } });
    const criar = (i: number) => admin.caller.records.create({ module: "ordens", data: { produto: `Peça ${i}`, molde: "M-0100", maquina: "INJ-07", quantidade: "100", entrega: "2026-12-01", status: "Planejada", prioridade: "Normal" } });
    const criadas = await Promise.all(Array.from({ length: 20 }, (_, i) => criar(i)));
    const codigos = criadas.map(o => String(o.codigo));
    expect(new Set(codigos).size).toBe(20);
    expect([...codigos].sort()[0]).toBe("OP-0001");
  });

  it("o mesmo código de estoque enviado 10 vezes ao mesmo tempo: 1 cria, 9 recebem CONFLICT", async () => {
    const { admin } = await setup();
    const tentativa = () => admin.caller.records.create({ module: "estoque", data: { codigo: "DUP-01", material: "PP", categoria: "Resina", saldo: "10", unidade: "kg", status: "Normal" } });
    const res = await Promise.allSettled(Array.from({ length: 10 }, tentativa));
    expect(res.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const recusas = res.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(recusas).toHaveLength(9);
    expect(recusas.every(r => (r.reason as { code?: string }).code === "CONFLICT")).toBe(true);
    expect((await admin.caller.records.list({ module: "estoque", search: "DUP-01" })).total).toBe(1);
  });

  it("o mesmo e-mail em 5 cadastros simultâneos de usuário: só 1 entra", async () => {
    const { admin } = await setup();
    const novo = (i: number) => admin.caller.usuarios.create({ nome: `Pessoa ${i}`, email: "mesma@teste.local", senha: `Senha-Forte-${i}x`, setor: "Produção", perfil: "Operador", matricula: `CC-${i}`, permissoes: {}, status: "Ativo" });
    const res = await Promise.allSettled([0, 1, 2, 3, 4].map(novo));
    expect(res.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const lista = await admin.caller.usuarios.list({ search: "mesma@teste.local" });
    expect(lista.items.filter(u => u.email === "mesma@teste.local")).toHaveLength(1);
  });

  it("solicitações do portal público ao mesmo tempo recebem protocolos diferentes", async () => {
    const { repo } = await setup("wamovale");
    const envio = async (i: number) => {
      const { caller } = await callerFor(repo, null, `10.9.0.${i + 1}`);
      return caller.publico.enviarSolicitacao({ tipo: "Contato", nome: `Visitante ${i}`, email: `v${i}@ex.com`, assunto: "Orçamento", mensagem: "Gostaria de um contato.", consentimento: true });
    };
    const protocolos = (await Promise.all(Array.from({ length: 8 }, (_, i) => envio(i)))).map(r => r.protocolo);
    expect(new Set(protocolos).size).toBe(8);
  });
});
