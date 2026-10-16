import { describe, expect, it } from "vitest";
import { authenticateDemoUser, isDemoAdmin } from "./demo-auth";

describe("demo authentication", () => {
  it("rejects unknown emails instead of granting collaborator access", () => {
    expect(authenticateDemoUser("qualquer@empresa.com", "qualquer-senha")).toBeNull();
  });

  it("rejects an incorrect administrative password", () => {
    expect(authenticateDemoUser("admin@wamovale.com.br", "senha-incorreta")).toBeNull();
  });

  it("authenticates the administrative demo account with full access", () => {
    expect(authenticateDemoUser("ADMIN@WAMOVALE.COM.BR", "adm123")).toEqual({
      name: "Administrador Wamovale",
      record: "ADM-00001",
      role: "admin",
    });
    expect(isDemoAdmin("admin@wamovale.com.br")).toBe(true);
  });

  it("authenticates only the documented collaborator demo accounts", () => {
    expect(authenticateDemoUser("ana.paula@wamovale.com.br", "demo123")).toMatchObject({
      name: "Ana Paula Souza",
      role: "collaborator",
    });
    expect(authenticateDemoUser("mariana.costa@wamovale.com.br", "demo123")).toMatchObject({
      name: "Mariana Costa",
      role: "collaborator",
    });
  });
});
