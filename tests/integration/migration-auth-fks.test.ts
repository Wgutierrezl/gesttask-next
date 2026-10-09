import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { MIGRATIONS_FOLDER, runMigrations } from "@/infrastructure/db/migrate";
import { testDatabaseUrl } from "./support/db";

/** Migration 0004 adds the auth tables and the user foreign keys; it must upgrade a database that already has data. */
const BEFORE_AUTH = 3;
const scratchDir = mkdtempSync(join(tmpdir(), "gesttask-migrations-"));
const scratchName = `${new URL(testDatabaseUrl()).pathname.slice(1)}_migrations`;
const urlFor = (database: string) => Object.assign(new URL(testDatabaseUrl()), { pathname: `/${database}` }).toString();
const BOARD = "00000000-0000-4000-8000-0000000000b1";

/** A copy of the migrations folder that stops after migration `upTo`, i.e. the schema before slice 3. */
function foldersUpTo(upTo: number): string {
  const folder = join(scratchDir, `up-to-${upTo}`);
  cpSync(MIGRATIONS_FOLDER, folder, { recursive: true });
  const journalPath = join(folder, "meta", "_journal.json");
  const journal = JSON.parse(readFileSync(journalPath, "utf8")) as { entries: { idx: number }[] };
  journal.entries = journal.entries.filter((entry) => entry.idx <= upTo);
  writeFileSync(journalPath, JSON.stringify(journal));
  return folder;
}

async function withClient<T>(database: string, work: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: urlFor(database) });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

/** Recreates the scratch database at the pre-auth schema, holding a board whose members are bare text ids. */
async function preAuthDatabase(memberIds: string[]): Promise<void> {
  await withClient("postgres", async (admin) => {
    await admin.query(`DROP DATABASE IF EXISTS "${scratchName}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${scratchName}"`);
  });
  await runMigrations(urlFor(scratchName), foldersUpTo(BEFORE_AUTH));
  await withClient(scratchName, async (db) => {
    await db.query(`INSERT INTO boards (id, name, created_at) VALUES ($1, 'Old board', now())`, [BOARD]);
    for (const id of memberIds) await db.query(`INSERT INTO board_members (board_id, user_id, role) VALUES ($1, $2, 'member')`, [BOARD, id]);
  });
}

afterAll(async () => {
  rmSync(scratchDir, { recursive: true, force: true });
  await withClient("postgres", (admin) => admin.query(`DROP DATABASE IF EXISTS "${scratchName}" WITH (FORCE)`));
});

describe("migration 0004 on a database with data", () => {
  it("backfills the demo users, keeps the rows and enforces the foreign keys afterwards", async () => {
    await preAuthDatabase(["demo-owner", "demo-viewer"]);
    await runMigrations(urlFor(scratchName));
    await withClient(scratchName, async (db) => {
      expect((await db.query(`SELECT id FROM "user" ORDER BY id`)).rows.map((r) => r.id)).toEqual(["demo-owner", "demo-viewer"]);
      expect((await db.query(`SELECT count(*)::int AS n FROM board_members`)).rows[0].n).toBe(2);
      await expect(db.query(`INSERT INTO board_members (board_id, user_id, role) VALUES ($1, 'nobody', 'member')`, [BOARD]))
        .rejects.toMatchObject({ code: "23503" });
    });
  });

  it("fails and rolls back when a row references an unknown user, leaving the old schema intact", async () => {
    await preAuthDatabase(["demo-owner", "ghost"]);
    await expect(runMigrations(urlFor(scratchName))).rejects.toThrow();
    await withClient(scratchName, async (db) => {
      expect((await db.query(`SELECT to_regclass('public."user"') AS t`)).rows[0].t).toBeNull();
      expect((await db.query(`SELECT count(*)::int AS n FROM board_members`)).rows[0].n).toBe(2);
    });
  });
});
