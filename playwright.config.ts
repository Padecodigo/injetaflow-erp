import { randomBytes } from "node:crypto";
import { defineConfig, devices } from "@playwright/test";

/**
 * E2E do InjetaFlow. Sobe o app de produção (build) na porta 3100 com uma pasta de dados
 * descartável (.data-e2e, ignorada pelo git). Nenhuma senha fica no repositório: as senhas de
 * teste vêm de E2E_ADMIN_PASSWORD/E2E_DEMO_PASSWORD ou são geradas a cada execução (os workers
 * herdam o process.env do processo principal, então todos enxergam os mesmos valores).
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);
process.env.E2E_ADMIN_PASSWORD ||= `e2e-${randomBytes(9).toString("base64url")}`;
process.env.E2E_DEMO_PASSWORD ||= `e2e-${randomBytes(9).toString("base64url")}`;
export const E2E_ADMIN = { email: "admin@wamovale.local", username: "admin", matricula: "ADM-0001", senha: process.env.E2E_ADMIN_PASSWORD };
export const E2E_DEMO_SENHA = process.env.E2E_DEMO_PASSWORD;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "rm -rf .data-e2e && pnpm build && node dist/index.js",
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: "ignore",
    env: {
      NODE_ENV: "production",
      PORT: String(PORT),
      INJETAFLOW_DATA_DIR: ".data-e2e",
      INJETAFLOW_ADMIN_PASSWORD: E2E_ADMIN.senha,
      INJETAFLOW_DEMO_PASSWORD: E2E_DEMO_SENHA,
      INJETAFLOW_COOKIE_SECURE: "false",
      // P7-07: o seed de ponto (origem "Demonstração") não roda em produção por padrão; o E2E liga explicitamente
      INJETAFLOW_SEED_DEMO_PONTO: "true",
    },
  },
});
