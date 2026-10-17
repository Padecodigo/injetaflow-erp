import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("portal home structure", () => {
  it("keeps the human connection section before the technical hero", () => {
    const source = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");
    const headerEnd = source.indexOf("</header><section className=\"portal-human\">");
    const technicalHero = source.indexOf('<main className="portal-main">');

    expect(headerEnd).toBeGreaterThan(-1);
    expect(technicalHero).toBeGreaterThan(headerEnd);
    expect(source).toContain("Projetos e engenharia");
    expect(source).toContain('<Link href="/moldes-e-ferramentaria">Projetos e engenharia</Link>');
    expect(source).toContain("Aeronáutico");
    expect(source).toContain("Automotivo");
    expect(source).toContain("Construção civil");
  });
});
