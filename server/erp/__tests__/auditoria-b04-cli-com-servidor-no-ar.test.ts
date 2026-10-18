import { spawn } from "node:child_process";
import express from "express";
import fs from "node:fs";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { JsonFileRepository } from "../repository";
import { USERS } from "../auth";
import { generatePassword, hashPassword, verifyPassword } from "../password";
import type { UserData } from "../types";
import { adquirirTrava, caminhoTrava, exigirServidorParado, idDaPasta, lerTrava, PastaDeDadosEmUsoError, travaAtiva } from "../trava";
import { registerErpHttpRoutes } from "../http";
import { pastaTemporaria, rodarCli, subirServidor } from "./helpers-servidor-dados";

/**
 * B-04 (alta): erp:reset-senha / erp:restaurar-usuario gravavam o arquivo com o servidor no ar e diziam
 * que deu certo; a próxima escrita do servidor (snapshot em memória) desfazia a mudança.
 * Correção: trava da pasta de dados + detecção do servidor na porta; as CLIs recusam com
 * "pare o servidor antes" e não tocam no store.
 */
const dirs: string[] = [];
const filhos: Array<() => void> = [];
afterAll(() => {
  for (const matar of filhos) matar();
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
});
const pasta = () => {
  const d = pastaTemporaria("b04-");
  dirs.push(d);
  return d;
};

/** Um processo vivo qualquer, para simular o servidor segurando a trava. */
function processoVivo(): number {
  const filho = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
  filhos.push(() => filho.kill("SIGKILL"));
  return filho.pid!;
}

async function storeComAdmin(dir: string) {
  const repo = new JsonFileRepository(path.join(dir, "injetaflow.json"));
  const hashAntigo = hashPassword(generatePassword(12));
  const adm = await repo.insert<UserData>(USERS, "wamovale", { nome: "Admin", email: "adm@wamovale.local", username: "admin", senhaHash: hashAntigo, setor: "Administrativo", perfil: "Administrador", matricula: "ADM-0001", permissoes: {}, status: "Ativo", ultimoAcesso: null });
  const excluido = await repo.insert<UserData>(USERS, "wamovale", { nome: "Ex", email: "ex@wamovale.local", username: "ex", senhaHash: hashAntigo, setor: "Produção", perfil: "Operador", matricula: "EX-1", permissoes: {}, status: "Ativo", ultimoAcesso: null });
  await repo.softDelete(USERS, "wamovale", excluido.id, null);
  repo.close();
  return { adm, excluido, hashAntigo };
}

describe("B-04: trava da pasta de dados (unitário)", () => {
  it("pega, reconhece a própria, recusa a de outro processo vivo e substitui a de processo morto", () => {
    const dir = pasta();
    const soltar = adquirirTrava(dir, { papel: "servidor", porta: 3999 });
    expect(lerTrava(dir)).toMatchObject({ pid: process.pid, papel: "servidor", porta: 3999 });
    expect(fs.statSync(caminhoTrava(dir)).mode & 0o777).toBe(0o600);
    expect(travaAtiva(dir)).toBeNull(); // a nossa não bloqueia a nós mesmos
    soltar();
    expect(fs.existsSync(caminhoTrava(dir))).toBe(false);

    const pid = processoVivo();
    fs.writeFileSync(caminhoTrava(dir), JSON.stringify({ pid, papel: "servidor", porta: 3001, desde: "agora", host: require("node:os").hostname() }));
    expect(travaAtiva(dir)?.pid).toBe(pid);
    expect(() => adquirirTrava(dir, { papel: "cli" })).toThrow(PastaDeDadosEmUsoError);

    fs.writeFileSync(caminhoTrava(dir), JSON.stringify({ pid: 2 ** 22 + 12345, papel: "servidor", desde: "ontem", host: require("node:os").hostname() }));
    expect(travaAtiva(dir)).toBeNull(); // sobra de queda
    adquirirTrava(dir, { papel: "cli" })();
  });

  it("exigirServidorParado recusa com a mensagem 'Pare o servidor antes' e 'Nada foi alterado'", async () => {
    const dir = pasta();
    const pid = processoVivo();
    fs.writeFileSync(caminhoTrava(dir), JSON.stringify({ pid, papel: "servidor", porta: 3001, desde: "agora", host: require("node:os").hostname() }));
    await expect(exigirServidorParado(dir, "erp:reset-senha", 0)).rejects.toThrow(/Pare o servidor antes.*Nada foi alterado/s);
  });

  it("reconhece o servidor desta pasta pela porta (/api/health/dados) mesmo sem a trava", async () => {
    const dir = pasta();
    const antes = process.env.INJETAFLOW_DATA_DIR;
    process.env.INJETAFLOW_DATA_DIR = dir;
    const app = express();
    registerErpHttpRoutes(app);
    const srv = app.listen(0);
    await new Promise(r => srv.once("listening", r));
    try {
      const porta = (srv.address() as AddressInfo).port;
      const res = await fetch(`http://127.0.0.1:${porta}/api/health/dados`);
      expect(await res.json()).toEqual({ dados: idDaPasta(dir) });
      await expect(exigirServidorParado(dir, "erp:reset-senha", porta)).rejects.toThrow(/respondendo na porta .*Pare o servidor antes/s);
      // outra pasta, mesma porta: não é o servidor dela
      const outra = pasta();
      const soltar = await exigirServidorParado(outra, "erp:reset-senha", porta);
      soltar();
    } finally {
      srv.close();
      if (antes === undefined) delete process.env.INJETAFLOW_DATA_DIR;
      else process.env.INJETAFLOW_DATA_DIR = antes;
    }
  });
});

describe("B-04: CLIs com o servidor no ar (integração, processos de verdade)", () => {
  it("erp:reset-senha e erp:restaurar-usuario recusam com a trava viva, saem com erro e não mexem no store", async () => {
    const dir = pasta();
    const { adm, excluido, hashAntigo } = await storeComAdmin(dir);
    const antes = fs.readFileSync(path.join(dir, "injetaflow.json"), "utf8");
    const pid = processoVivo();
    fs.writeFileSync(caminhoTrava(dir), JSON.stringify({ pid, papel: "servidor", porta: 3001, desde: "agora", host: require("node:os").hostname() }));

    const reset = rodarCli("tools/reset-admin-password.ts", ["admin"], dir, { INJETAFLOW_ADMIN_PASSWORD: generatePassword(10) });
    expect(reset.status).toBe(2);
    expect(reset.stderr).toMatch(/Pare o servidor antes/);
    expect(reset.stderr).toMatch(new RegExp(`pid ${pid}`));
    expect(reset.stdout).not.toMatch(/Usuário atualizado/);

    const restaurar = rodarCli("tools/restaurar-usuario.ts", ["EX-1"], dir);
    expect(restaurar.status).toBe(2);
    expect(restaurar.stderr).toMatch(/Pare o servidor antes/);

    expect(fs.readFileSync(path.join(dir, "injetaflow.json"), "utf8")).toBe(antes);
    const lido = new JsonFileRepository(path.join(dir, "injetaflow.json"), { somenteLeitura: true });
    expect((await lido.get<UserData>(USERS, "wamovale", adm.id))?.data.senhaHash).toBe(hashAntigo);
    expect(await lido.get(USERS, "wamovale", excluido.id)).toBeNull();
    expect(lerTrava(dir)?.pid).toBe(pid); // a trava do "servidor" continua lá
  }, 60_000);

  it("servidor real: CLI recusa enquanto ele roda; segundo servidor na mesma pasta não sobe; depois de parar, o reset vale", async () => {
    const dir = pasta();
    const { adm } = await storeComAdmin(dir);
    const srv = await subirServidor(dir);
    try {
      expect(lerTrava(dir)).toMatchObject({ papel: "servidor", porta: srv.porta }); // o pid é o do node que o tsx sobe
      const senha = generatePassword(10);
      const recusado = rodarCli("tools/reset-admin-password.ts", ["admin"], dir, { INJETAFLOW_ADMIN_PASSWORD: senha, PORT: String(srv.porta) });
      expect(recusado.status).toBe(2);
      expect(recusado.stderr).toMatch(/servidor \(pid \d+, porta \d+\).*Pare o servidor antes/s);

      const segundo = await subirServidor(dir, {}, false);
      expect(await segundo.fim).toBe(1);
      expect(segundo.log()).toMatch(/NÃO subiu.*em uso/s);

      expect(await srv.parar("SIGTERM")).toBe(0);
      expect(fs.existsSync(caminhoTrava(dir))).toBe(false); // soltou a trava ao sair

      const ok = rodarCli("tools/reset-admin-password.ts", ["admin"], dir, { INJETAFLOW_ADMIN_PASSWORD: senha });
      expect(ok.status, ok.stderr).toBe(0);
      expect(ok.stdout).toMatch(/Usuário atualizado/);
      const lido = new JsonFileRepository(path.join(dir, "injetaflow.json"), { somenteLeitura: true });
      expect(verifyPassword(senha, (await lido.get<UserData>(USERS, "wamovale", adm.id))!.data.senhaHash)).toBe(true);
    } finally {
      await srv.parar("SIGKILL");
    }
  }, 90_000);
});
