import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const alias = {
  "@tests": fileURLToPath(new URL("./tests", import.meta.url)),
  "@": fileURLToPath(new URL("./src", import.meta.url)),
  // `server-only` throws outside the react-server condition; neutralize it in tests.
  "server-only": fileURLToPath(new URL("./tests/support/server-only.ts", import.meta.url)),
};

export default defineConfig({
  resolve: { alias },
  test: {
    coverage: {
      provider: "v8",
      // Verified: with no matching files (slice 0) vitest reports 0/0 and exits 0; as soon as a file
      // exists under these globs (slice 1) the 90% global thresholds apply and fail the run below it.
      // `all` is implicit: uncovered files inside `include` count as 0%.
      include: ["src/domain/**", "src/application/**"],
      thresholds: { lines: 90, branches: 90, functions: 90, statements: 90 },
    },
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.{ts,tsx}", "src/**/*.test.{ts,tsx}"],
          environment: "node",
          // Tests that import the auth library cold take seconds to transform on a loaded machine.
          testTimeout: 20_000,
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          // Every file truncates the same Postgres database, so files must not overlap.
          fileParallelism: false,
          globalSetup: ["tests/integration/global-setup.ts"],
          testTimeout: 30_000,
        },
      },
    ],
  },
});
