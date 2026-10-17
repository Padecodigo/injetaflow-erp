import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("action records", () => {
  it("persists submitted contextual forms locally with actor and module", () => {
    const source = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");
    expect(source).toContain("localStorage.getItem(\"injetaflow-action-records\")");
    expect(source).toContain("localStorage.setItem(\"injetaflow-action-records\"");
    expect(source).toContain("crypto.randomUUID()");
    expect(source).toContain("onSave({ id:");
    expect(source).toContain("Histórico local atualizado");
  });
});
