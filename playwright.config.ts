import { defineConfig, devices } from "@playwright/test";
import { E2E_ORIGIN, serverEnv } from "./e2e/env";

/** Tall enough for a whole Kanban board: pointer drags work in viewport coordinates. */
const VIEWPORT = { width: 1280, height: 1000 };

/**
 * End-to-end tests run against the production build (`pnpm build` first) served by `next start`, with the local Postgres
 * (`pnpm e2e` recreates the database) and the filesystem storage driver: no cloud account is involved (REQ-LOC-04).
 * One worker: the specs share the database and the demo guest rate limit (5 sign-ins per hour per address).
 */
export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: { baseURL: E2E_ORIGIN, trace: "retain-on-failure" },
  projects: [
    { name: "setup", testMatch: "**/*.setup.ts", use: { ...devices["Desktop Chrome"], viewport: VIEWPORT } },
    { name: "chromium", testMatch: "**/*.spec.ts", dependencies: ["setup"], use: { ...devices["Desktop Chrome"], viewport: VIEWPORT } },
  ],
  webServer: {
    command: "pnpm exec next start",
    // Static, so it answers before any database work: only tells that the server is up.
    url: `${E2E_ORIGIN}/api/v1/openapi.json`,
    env: { ...serverEnv, NODE_ENV: "production" },
    reuseExistingServer: false,
    timeout: 60_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
