/** One place for the e2e configuration, shared by the database preparation, the server and the tests. */
export const E2E_PORT = 3100;
export const E2E_ORIGIN = `http://localhost:${E2E_PORT}`;

const ADMIN_URL = process.env.E2E_ADMIN_DATABASE_URL ?? "postgres://gesttask:gesttask@localhost:5433/postgres";
const DATABASE = "gesttask_e2e";

export const adminDatabaseUrl = ADMIN_URL;
export const databaseUrl = (() => {
  const url = new URL(ADMIN_URL);
  url.pathname = `/${DATABASE}`;
  return url.toString();
})();
export const databaseName = DATABASE;

/** What `next start` runs with: the local Postgres and the filesystem storage driver, no cloud accounts. */
export const serverEnv = {
  DB_DRIVER: "pg",
  DATABASE_URL: databaseUrl,
  STORAGE_DRIVER: "local",
  BETTER_AUTH_SECRET: "e2e-only-secret-0123456789abcdef-0123456789",
  BETTER_AUTH_URL: E2E_ORIGIN,
  // `next start` appends the client address to x-forwarded-for itself: one hop makes rate limits work like in production.
  TRUSTED_PROXY_HOPS: "1",
  PORT: String(E2E_PORT),
} as const;
