import { defineConfig, devices } from "@playwright/test";
import { E2E_STORAGE_STATE_PATH } from "./tests/e2e/support/session";

/**
 * Las pruebas de extremo a extremo se ejecutan contra la compilación de
 * producción (véase `scripts/e2e-server.ts`). El puerto es propio para no
 * interferir con un servidor de desarrollo en marcha.
 */
const port = Number(process.env.E2E_PORT ?? 3100);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      // Prepara la cuenta de pruebas y guarda la sesión compartida.
      name: "preparacion",
      testMatch: /.*\.setup\.ts/u,
    },
    {
      name: "chromium",
      dependencies: ["preparacion"],
      use: {
        ...devices["Desktop Chrome"],
        storageState: E2E_STORAGE_STATE_PATH,
      },
    },
  ],
  webServer: process.env.PLAYWRIGHT_SKIP_WEB_SERVER
    ? undefined
    : {
        command: "pnpm exec tsx scripts/e2e-server.ts",
        url: `${baseURL}/api/health`,
        // No se reutiliza ningún servidor: las pruebas deben comprobar siempre
        // la compilación que se acaba de generar.
        reuseExistingServer: false,
        timeout: 300_000,
        // APP_URL debe coincidir con el origen real: las Server Actions
        // rechazan las peticiones que llegan de otro origen.
        env: { PORT: String(port), APP_URL: baseURL },
      },
});
