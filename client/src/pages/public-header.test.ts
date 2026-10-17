import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("public header alignment", () => {
  it("uses the same container and logo scale across public routes", () => {
    const css = readFileSync(resolve(process.cwd(), "client/src/index.css"), "utf8");
    expect(css).toContain(".public-form-header { max-width: 1240px; padding: 24px 34px");
    expect(css).toContain(".public-form-header img { width: 122px; height: 57px; }");
    expect(css).toContain(".public-form-header .institutional-nav { gap: 24px; }");
  });
});
