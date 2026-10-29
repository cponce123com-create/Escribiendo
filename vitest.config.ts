import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  oxc: { jsx: { runtime: "automatic" } },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./apps/web/src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["apps/**/*.test.ts", "packages/**/*.test.ts", "scripts/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/.next/**", "tests/e2e/**"],
    testTimeout: 15_000,
    hookTimeout: 15_000,
    restoreMocks: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      reportsDirectory: "coverage",
      include: ["apps/web/src/lib/**/*.ts", "packages/*/src/**/*.ts"],
      exclude: ["**/*.test.ts", "**/*.d.ts", "**/__snapshots__/**"],
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 50,
        statements: 60,
      },
    },
  },
});
