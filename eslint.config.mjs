import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "build/**", "coverage/**", "next-env.d.ts", "tests/fixtures/**"]),
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      // Structured logger only (REQ-SEC-01).
      "no-console": "error",
    },
  },
]);
