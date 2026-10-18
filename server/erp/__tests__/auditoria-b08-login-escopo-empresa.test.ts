// Auditoria back-end, B-08 (média): login por usuário/matrícula procurava em TODAS as empresas e escolhia a conta
// pela senha que batesse; e o CONFLICT de e-mail revelava que o e-mail existia em outra empresa.
// Agora cada tentativa é conferida em UMA empresa (`empresa` no login ou, sem ela, a única que tem o identificador ou
// a empresa padrão) e a mensagem de e-mail indisponível é a mesma para esta empresa e para as outras.
import { afterEach, describe, expect, it, vi } from "vitest";
import { PERFIL_PRESETS } from "@shared/erp/modules";
import { escoparEmpresa, findLoginCandidates } from "../auth";
import { createUser, EMAIL_INDISPONIVEL } from "../users";
import { generatePassword } from "../password";
import { callerFor, setup } from "./helpers";

afterEach(() => vi.unstubAllEnvs());

async function duasEmpresas() {
  const ctx = await setup("empresa-a");
  const senhaA = generatePassword(12);
  const senhaB = generatePassword(12);
  await createUser(ctx.repo, null, "empresa-a", { nome: "Chefe A", email: "chefe@a.local", username: "chefe", senha: senhaA, setor: "Administrativo", perfil: "Administrador", matricula: "CH-1", permissoes: PERFIL_PRESETS.Administrador, status: "Ativo" });
  await createUser(ctx.repo, null, "empresa-b", { nome: "Chefe B", email: "chefe@b.local", username: "chefe", senha: senhaB, setor: "Administrativo", perfil: "Administrador", matricula: "CH-1", permissoes: PERFIL_PRESETS.Administrador, status: "Ativo" });
  return { ...ctx, senhaA, senhaB };
}

describe("B-08: identificadores de login com escopo de empresa", () => {
  it("usuário/matrícula repetidos em duas empresas: sem `empresa` vale só a empresa padrão; nunca 'a que a senha bater'", async () => {
    vi.stubEnv("INJETAFLOW_PUBLIC_EMPRESA", "empresa-a");
    const { repo, senhaA, senhaB } = await duasEmpresas();
    const anon = await callerFor(repo);
    await expect(anon.caller.auth.login({ identificador: "chefe", password: senhaA })).resolves.toMatchObject({ empresaId: "empresa-a" });
    // a senha da empresa B não entra na empresa B sem escolher a empresa
    await expect(anon.caller.auth.login({ identificador: "chefe", password: senhaB })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(anon.caller.auth.login({ identificador: "CH-1", password: senhaB })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    // com a empresa escolhida, entra na B (e só na B)
    await expect(anon.caller.auth.login({ identificador: "chefe", password: senhaB, empresa: "empresa-b" })).resolves.toMatchObject({ empresaId: "empresa-b" });
    await expect(anon.caller.auth.login({ identificador: "chefe", password: senhaA, empresa: "empresa-b" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("identificador ambíguo sem a empresa padrão entre as candidatas: nenhuma conta é testada", async () => {
    vi.stubEnv("INJETAFLOW_PUBLIC_EMPRESA", "outra-empresa");
    const { repo } = await duasEmpresas();
    expect(await findLoginCandidates(repo, "chefe")).toEqual([]);
    expect((await findLoginCandidates(repo, "chefe", "empresa-b")).map(c => c.empresaId)).toEqual(["empresa-b"]);
    // identificador que existe numa empresa só continua funcionando sem `empresa` (instalação de uma empresa)
    expect((await findLoginCandidates(repo, "chefe@b.local")).map(c => c.empresaId)).toEqual(["empresa-b"]);
    expect(escoparEmpresa([{ empresaId: "x" }, { empresaId: "x" }], undefined, "y")).toHaveLength(2);
  });

  it("e-mail com `empresa` diferente da dele não entra", async () => {
    const { repo, senhaB } = await duasEmpresas();
    const anon = await callerFor(repo);
    await expect(anon.caller.auth.login({ email: "chefe@b.local", password: senhaB, empresa: "empresa-a" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(anon.caller.auth.login({ email: "chefe@b.local", password: senhaB })).resolves.toMatchObject({ empresaId: "empresa-b" });
  });

  it("e-mail de outra empresa não é revelado: mesma mensagem para esta e para outra empresa", async () => {
    const { admin } = await duasEmpresas();
    const base = { nome: "Teste", senha: generatePassword(12), setor: "Produção" as const, perfil: "Consulta" as const };
    const outra = await admin.caller.usuarios.create({ ...base, email: "chefe@b.local", matricula: "A-1" }).catch(e => e);
    const mesma = await admin.caller.usuarios.create({ ...base, email: "chefe@a.local", matricula: "A-2" }).catch(e => e);
    expect(outra.message).toBe(EMAIL_INDISPONIVEL);
    expect(mesma.message).toBe(EMAIL_INDISPONIVEL);
    expect(String(outra.message)).not.toMatch(/já está cadastrado|chefe@b/);
  });
});
