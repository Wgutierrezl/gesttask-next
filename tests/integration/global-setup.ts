import pg from "pg";
import { runMigrations } from "@/infrastructure/db/migrate";
import { testDatabaseUrl } from "./support/db";

/** Creates the `_test` database when missing, then applies the committed migrations to it. */
export default async function setup(): Promise<void> {
  const url = new URL(testDatabaseUrl());
  const name = url.pathname.slice(1);
  const admin = new pg.Client({ connectionString: Object.assign(new URL(url), { pathname: "/postgres" }).toString() });
  await admin.connect();
  try {
    const exists = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
    if (exists.rowCount === 0) await admin.query(`CREATE DATABASE "${name}"`);
  } finally {
    await admin.end();
  }
  await runMigrations(url.toString());
}
