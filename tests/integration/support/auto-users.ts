import { sql } from "drizzle-orm";
import type { DbHandle } from "@/infrastructure/db/client";

/** Every column that references the auth `user` table: [table, column]. */
const USER_REFERENCES = [
  ["board_members", "user_id"],
  ["tasks", "assignee_id"],
  ["comments", "author_id"],
  ["attachments", "uploader_id"],
] as const;

const TRIGGER = "autoprovision_user";

/**
 * Test-database fixture (installed by the global setup, never by migrations): rows that reference a user id
 * get that user created on the fly. The foreign keys stay real; this only spares every test from
 * inserting `user` rows by hand. `withoutAutoUsers` switches it off to test the constraints themselves.
 */
export async function installAutoUsers(handle: DbHandle): Promise<void> {
  const { db } = handle;
  const current = await db.execute<{ name: string }>(sql`SELECT current_database() AS name`);
  const name = current.rows[0]?.name ?? "";
  if (!name.endsWith("_test")) throw new Error(`installAutoUsers refuses to touch "${name}": only *_test databases are allowed`);
  await db.execute(sql`
    CREATE OR REPLACE FUNCTION test_autoprovision_user() RETURNS trigger AS $$
    DECLARE ref text := to_jsonb(NEW) ->> TG_ARGV[0];
    BEGIN
      IF ref IS NOT NULL THEN
        INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
        VALUES (ref, ref, ref || '@test.invalid', false, now(), now()) ON CONFLICT (id) DO NOTHING;
      END IF;
      RETURN NEW;
    END $$ LANGUAGE plpgsql`);
  for (const [table, column] of USER_REFERENCES) {
    await db.execute(sql.raw(`DROP TRIGGER IF EXISTS ${TRIGGER} ON "${table}"`));
    await db.execute(sql.raw(
      `CREATE TRIGGER ${TRIGGER} BEFORE INSERT OR UPDATE ON "${table}" FOR EACH ROW EXECUTE FUNCTION test_autoprovision_user('${column}')`,
    ));
  }
}

/** Runs `work` with the fixture disabled so the foreign keys to `user` are the only line of defence. */
export async function withoutAutoUsers<T>(handle: DbHandle, work: () => Promise<T>): Promise<T> {
  const toggle = async (action: "DISABLE" | "ENABLE") => {
    for (const [table] of USER_REFERENCES) await handle.db.execute(sql.raw(`ALTER TABLE "${table}" ${action} TRIGGER ${TRIGGER}`));
  };
  await toggle("DISABLE");
  try {
    return await work();
  } finally {
    await toggle("ENABLE");
  }
}
