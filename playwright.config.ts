import { defineConfig, devices } from "@playwright/test";

/**
 * Pruebas de punta a punta contra el servidor de desarrollo (PGlite). Los
 * códigos de verificación se leen del log del servidor (`STLIC_LOG_DEV`),
 * donde el modo desarrollo imprime los mails.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.STLIC_URL ?? "http://localhost:3000",
    locale: "es-AR",
    timezoneId: "America/Argentina/Buenos_Aires",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
