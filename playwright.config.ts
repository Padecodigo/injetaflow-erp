import { defineConfig, devices } from "@playwright/test";

/**
 * E2E do InjetaFlow. Sobe o app de produção (build) na porta 3100 com uma pasta de dados
 * descartável (.data-e2e, ignorada pelo git) e senhas de TESTE definidas aqui (não são segredos).
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);
export const E2E_ADMIN = { email: "admin@wamovale.local", senha: "E2E-Admin-Senha-1" };
export const E2E_DEMO_SENHA = "E2E-Demo-Senha-1";

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
    },
  },
});
