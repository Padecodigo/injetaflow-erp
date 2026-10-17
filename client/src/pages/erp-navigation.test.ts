import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("ERP navigation actions", () => {
  it("keeps Dashboard inside the ERP and wires help and profile actions", () => {
    const home = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");
    const app = readFileSync(resolve(process.cwd(), "client/src/App.tsx"), "utf8");
    expect(home).toContain('{ label: "Dashboard", href: "/dashboard"');
    expect(home).toContain('current.href === "/dashboard" ? <Dashboard');
    expect(home).toContain('onClick={handleHelp}');
    expect(home).toContain('onClick={handleProfileNavigation}');
    expect(app).toContain('<Route path="/dashboard" component={Home} />');
  });
});
