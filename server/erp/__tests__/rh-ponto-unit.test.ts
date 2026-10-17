import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { avaliarSequencia, nextAllowed, PONTO_SO_NO_RELOGIO, TIPOS_PONTO, type TipoPonto } from "../rh";
import { resumoNegacaoPonto, textoSeguro } from "../ponto-negacoes";
import { deveSemearPontoDemo } from "../seed";
import { appRouter } from "../../routers";
import { ROTAS_PONTO_REMOVIDAS } from "@shared/erp/ponto";
import { MODULES } from "@shared/erp/modules";

// F0a (plano RH/Ponto v2, §2.2-c): avaliação pura da sequência. Nunca lança erro; só descreve a divergência.
describe("F0a: avaliarSequencia (unit)", () => {
  it("sequência válida não marca divergência", () => {
    const validas: [TipoPonto | null, TipoPonto][] = [
      [null, "Entrada"],
      ["Entrada", "Início de intervalo"],
      ["Início de intervalo", "Fim de intervalo"],
      ["Fim de intervalo", "Saída"],
      ["Entrada", "Saída"],
      ["Saída", "Entrada"],
    ];
    for (const [last, tipo] of validas) {
      const out = avaliarSequencia(last, tipo);
      expect(out, `${last} → ${tipo}`).toMatchObject({ foraDeSequencia: false });
      expect(out.divergencia).toBeUndefined();
    }
  });

  it("sequência inválida é marcada, com o esperado na mensagem", () => {
    const out = avaliarSequencia(null, "Saída");
    expect(out).toMatchObject({ foraDeSequencia: true, esperado: ["Entrada"] });
    expect(out.divergencia).toMatch(/após "nenhuma batida" o esperado era Entrada/);
    expect(avaliarSequencia("Início de intervalo", "Saída")).toMatchObject({ foraDeSequencia: true, esperado: ["Fim de intervalo"] });
    expect(avaliarSequencia("Entrada", "Entrada").divergencia).toMatch(/Início de intervalo ou Saída/);
  });

  it("nunca lança erro para nenhuma combinação de tipos", () => {
    for (const last of [null, ...TIPOS_PONTO]) {
      for (const tipo of TIPOS_PONTO) {
        expect(() => avaliarSequencia(last, tipo)).not.toThrow();
        expect(avaliarSequencia(last, tipo).foraDeSequencia).toBe(!nextAllowed(last).includes(tipo));
      }
    }
  });
});

// F0c (plano RH/Ponto v3, §7): o ERP não registra ponto; a marcação oficial é feita no relógio (REP).
describe("F0c: orientação única (unit)", () => {
  it("menciona o relógio oficial (REP) e a ocorrência de ajuste, sem detalhes técnicos", () => {
    expect(PONTO_SO_NO_RELOGIO).toMatch(/relógio oficial \(REP\)/);
    expect(PONTO_SO_NO_RELOGIO).toMatch(/ocorrência de ajuste/);
    expect(PONTO_SO_NO_RELOGIO).not.toMatch(/stack|trpc|procedure|Error/i);
  });
});

describe("P7-02/P7-05: nenhuma rota grava ponto (unit)", () => {
  it("as procedures registrarPonto não existem mais no router", () => {
    const procedures = Object.keys((appRouter as unknown as { _def: { procedures: Record<string, unknown> } })._def.procedures);
    for (const rota of ROTAS_PONTO_REMOVIDAS) expect(procedures, rota).not.toContain(rota);
    expect(procedures.filter(p => /registrarPonto|baterPonto/i.test(p))).toEqual([]);
  });

  it("nenhum arquivo do servidor fora do seed importa o gravador de demonstração", () => {
    const dir = join(__dirname, "..");
    const arquivos = readdirSync(dir).filter(f => f.endsWith(".ts"));
    const importam = arquivos.filter(f => /from "\.\/ponto-demonstracao"/.test(readFileSync(join(dir, f), "utf8")));
    expect(importam).toEqual(["seed.ts"]);
    for (const f of ["router.ts", join("..", "routers.ts"), join("..", "_core", "trpc.ts")]) {
      expect(readFileSync(join(dir, f), "utf8"), f).not.toMatch(/ponto-demonstracao|registrarPontoDemonstracao/);
    }
    // e o rh.ts não grava mais ponto
    expect(readFileSync(join(dir, "rh.ts"), "utf8")).not.toMatch(/repo\.insert/);
  });
});

describe("P7-03: resumo da negação distingue próprio ponto de outra pessoa (unit)", () => {
  const eu = { matricula: "MAT-0001" };
  it("próprio ponto, com a matrícula", () => {
    const r = resumoNegacaoPonto(eu, "records.create", "mat-0001", "Entrada");
    expect(r).toMatch(/o próprio ponto, matrícula mat-0001/);
    expect(r).not.toMatch(/outra pessoa/);
    expect(r).toMatch(/\(Entrada\)/);
  });
  it("outra pessoa, com a matrícula-alvo", () => {
    const r = resumoNegacaoPonto(eu, "records.create", "MAT-0002");
    expect(r).toMatch(/em nome de outra pessoa, matrícula MAT-0002/);
    expect(r).not.toMatch(/próprio/);
  });
  it("sem matrícula e por rota (alterar/excluir)", () => {
    expect(resumoNegacaoPonto(eu, "records.create", "")).toMatch(/sem matrícula informada/);
    expect(resumoNegacaoPonto(eu, "records.update", "MAT-0002")).toMatch(/^Tentativa de alterar marcação de ponto/);
    expect(resumoNegacaoPonto(eu, "records.remove", "MAT-0001")).toMatch(/^Tentativa de excluir marcação de ponto .*próprio ponto/);
  });
  it("textoSeguro trunca, remove controles e ignora tipos não textuais", () => {
    expect(textoSeguro("x".repeat(500))).toHaveLength(40);
    expect(textoSeguro("a\nb\r\tc")).toBe("a b c");
    expect(textoSeguro({ toString: () => "MAT" })).toBe("");
    expect(textoSeguro(["MAT"])).toBe("");
    expect(textoSeguro(123)).toBe("123");
  });
});

describe("P7-07: seed de ponto de demonstração nunca em produção por padrão (unit)", () => {
  it("decide pelo ambiente", () => {
    expect(deveSemearPontoDemo({ NODE_ENV: "production" })).toBe(false);
    expect(deveSemearPontoDemo({ NODE_ENV: "production", INJETAFLOW_SEED_DEMO_PONTO: "true" })).toBe(true);
    expect(deveSemearPontoDemo({ NODE_ENV: "development" })).toBe(true);
    expect(deveSemearPontoDemo({ NODE_ENV: "development", INJETAFLOW_SEED_DEMO_PONTO: "false" })).toBe(false);
    expect(deveSemearPontoDemo({})).toBe(true);
  });
});

describe("P7-06: módulo ponto declara foraDeSequencia e mostra Validação na tabela (unit)", () => {
  it("campos e colunas", () => {
    const mod = MODULES.ponto;
    const campo = (n: string) => mod.fields.find(f => f.name === n);
    expect(campo("foraDeSequencia")).toMatchObject({ readOnly: true });
    expect(campo("validacao")).toMatchObject({ readOnly: true, label: "Validação" });
    expect(mod.columns).toContain("validacao");
    expect(campo("origem")?.options).toContain("Demonstração");
  });
});
