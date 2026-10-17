import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("public typography scale", () => {
  it("keeps public navigation, hero titles and supporting copy on a shared scale", () => {
    const css = readFileSync(resolve(process.cwd(), "client/src/index.css"), "utf8");
    expect(css).toContain(".portal-copy h1, .institutional-intro h1 { font-size: clamp(40px, 5vw, 64px)");
    expect(css).toContain(".portal-copy p, .institutional-intro > p { font-size: 14px");
    expect(css).toContain(".portal-header nav > a:not(.portal-login-link), .institutional-nav > a:not(.portal-login-link) { font-size: 12px");
  });
});
