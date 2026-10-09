import { sql } from "drizzle-orm";
import { createDb, type DbHandle } from "@/infrastructure/db/client";

const LOCAL_URL = "postgres://gesttask:gesttask@localhost:5433/gesttask";

/**
 * Integration tests never touch the development database: they run in `<name>_test`, which the global
 * setup creates and migrates. `TEST_DATABASE_URL` overrides the derived URL.
 */
export function testDatabaseUrl(): string {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  const url = new URL(process.env.DATABASE_URL ?? LOCAL_URL);
  const name = url.pathname.slice(1);
  url.pathname = `/${name.endsWith("_test") ? name : `${name}_test`}`;
  return url.toString();
}

/** A pool whose statements die after `statementTimeoutMs`, so a lock bug fails the test instead of hanging it. */
export function connectTestDb(statementTimeoutMs = 10_000): DbHandle {
  return createDb({ driver: "pg", url: testDatabaseUrl(), statementTimeoutMs, maxConnections: 10 });
}

/** Empties every application table (the migration journal lives in the `drizzle` schema and is kept). */
export async function resetDb(handle: DbHandle): Promise<void> {
  const { rows } = await handle.db.execute<{ tablename: string }>(
    sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
  );
  if (rows.length === 0) return;
  const tables = rows.map((r) => `"${r.tablename}"`).join(", ");
  await handle.db.execute(sql.raw(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`));
}
