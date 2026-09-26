import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    // Cada archivo crea su Postgres en memoria: en paralelo puede tardar.
    hookTimeout: 60_000,
  },
});
