import pg from "pg";
import { runMigrations } from "../src/infrastructure/db/migrate";
import { adminDatabaseUrl, databaseName, databaseUrl } from "./env";

/** A fresh, migrated database for every run: the suite never depends on what an earlier run left behind. */
const admin = new pg.Client({ connectionString: adminDatabaseUrl });
await admin.connect();
try {
  await admin.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${databaseName}`);
} finally {
  await admin.end();
}
await runMigrations(databaseUrl);
process.stdout.write(`e2e database ${databaseName} ready\n`);
