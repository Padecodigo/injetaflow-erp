import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { avaliarSequencia, nextAllowed, PONTO_SO_NO_RELOGIO, registroPontoDesativado, TIPOS_PONTO, type TipoPonto } from "../rh";

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
describe("F0c: registroPontoDesativado (unit)", () => {
  it("é um FORBIDDEN com orientação para o relógio oficial e para a ocorrência de ajuste", () => {
    const err = registroPontoDesativado();
    expect(err).toBeInstanceOf(TRPCError);
    expect(err.code).toBe("FORBIDDEN");
    expect(err.message).toBe(PONTO_SO_NO_RELOGIO);
    expect(PONTO_SO_NO_RELOGIO).toMatch(/relógio oficial \(REP\)/);
    expect(PONTO_SO_NO_RELOGIO).toMatch(/ocorrência de ajuste/);
  });

  it("a mensagem não expõe detalhes técnicos", () => {
    expect(PONTO_SO_NO_RELOGIO).not.toMatch(/stack|trpc|procedure|Error/i);
  });
});
