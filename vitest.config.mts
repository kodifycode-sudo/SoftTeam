import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    // Cada archivo crea su Postgres en memoria: en paralelo puede tardar.
    hookTimeout: 60_000,
    // Reutiliza los workers entre archivos (~40 s en vez de ~64 s). Cada
    // archivo tiene su propia base, pero el estado de los módulos se comparte:
    // los tests no deben depender de contadores ni usar vi.mock/vi.stubEnv.
    isolate: false,
  },
});
