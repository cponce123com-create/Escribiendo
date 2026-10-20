import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-console": ["error", { allow: ["error", "warn"] }],
      "prefer-const": "error",
      eqeqeq: ["error", "always"],
      // El proyecto usa exclusivamente App Router: no existe directorio pages/,
      // por lo que la regla no puede resolver sus rutas.
      "@next/next/no-html-link-for-pages": "off",
    },
  },
  {
    files: ["**/*.test.ts", "**/*.test.tsx", "tests/**/*.ts"],
    rules: {
      "no-console": "off",
    },
  },
  {
    // Los scripts de administración se ejecutan en una terminal y su salida
    // es el resultado de la operación.
    files: ["scripts/**/*.ts"],
    rules: {
      "no-console": "off",
    },
  },
  globalIgnores([
    "**/node_modules/**",
    "**/.next/**",
    "**/coverage/**",
    "**/playwright-report/**",
    "**/test-results/**",
    "**/next-env.d.ts",
    "**/generated/**",
  ]),
]);
