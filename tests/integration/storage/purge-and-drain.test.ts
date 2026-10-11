import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/application/actor";
import { makeRequestUpload } from "@/application/use-cases/attachments/request-upload";
import { makeCreateComment } from "@/application/use-cases/comments/create-comment";
import { SeededGuestSandbox, sandboxBoardId } from "@/infrastructure/auth/guest-sandbox";
import * as schema from "@/infrastructure/db/schema";
import { createMaintenance } from "@/infrastructure/maintenance";
import { InMemoryRateLimiter } from "@/infrastructure/ratelimit/in-memory-rate-limiter";
import { LocalStorage } from "@/infrastructure/storage/local.adapter";
import { createLogger } from "@/infrastructure/logging/logger";
import { connectTestDb, resetDb } from "../support/db";
import { deferred, drizzleDeps } from "../support/tx";

const handle = connectTestDb();
const { db } = handle;
const deps = drizzleDeps(handle);
const NOW = new Date("2026-10-10T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);
const root = mkdtempSync(join(tmpdir(), "gesttask-purge-"));
const clock = { now: () => NOW };
const storage = new LocalStorage({ rootDir: root, secret: "purge-test-secret-purge-test-secret", baseUrl: "http://localhost:3000", clock });
const lines: string[] = [];
const maintenance = createMaintenance({ db, clock, storage, logger: createLogger({ level: "debug", write: (line) => void lines.push(line) }) });

beforeEach(async () => {
  await resetDb(handle);
  lines.length = 0;
});
afterAll(async () => {
  rmSync(root, { recursive: true, force: true });
  await handle.close();
});

const queued = async () => (await db.execute<{ storage_key: string }>(sql`SELECT storage_key FROM storage_deletions`)).rows.map((r) => r.storage_key);

async function guestWithAttachment(id: string, ageHours: number): Promise<string> {
  await db.insert(schema.user).values({ id, name: id, email: `${id}@x.test`, emailVerified: false, isAnonymous: true, createdAt: hoursAgo(ageHours), updatedAt: hoursAgo(ageHours) });
  const actor: Actor = { userId: id, isGuest: true };
  await new SeededGuestSandbox(db, { uow: deps.uow, ids: { next: randomUUID }, clock }).provision(actor);
  const [task] = await db.select().from(schema.tasks).where(eq(schema.tasks.boardId, sandboxBoardId(id))).limit(1);
  const upload = await makeRequestUpload({ ...deps, clock }, { storage, limiter: new InMemoryRateLimiter(clock) })(actor, {
    taskId: task!.id, fileName: "scan.png", contentType: "image/png", size: 4,
  });
  if (upload.ticket.kind !== "local-put") throw new Error("local ticket expected");
  const sent = await storage.handle(new Request(upload.ticket.url, { method: "PUT", headers: { "content-type": "image/png" }, body: new Blob([new Uint8Array([1, 2, 3, 4])]) }));
  expect(sent.status).toBe(204);
  await makeCreateComment({ ...deps, clock }, { storage })(actor, { taskId: task!.id, body: "proof", attachmentIds: [upload.attachmentId] });
  return `boards/${sandboxBoardId(id)}/attachments/${upload.attachmentId}`;
}

describe("guest purge and storage drain (REQ-CAS-03, REQ-ATT-05)", () => {
  it("queues the purged sandbox's objects in the purge transaction, and the drain then removes them from storage", async () => {
    const key = await guestWithAttachment("old-guest", 30);
    expect(await storage.head(key)).toEqual({ size: 4, contentType: "image/png" });

    expect(await maintenance.purgeExpiredGuests()).toEqual({ users: 1, boards: 1 });
    expect(await queued()).toEqual([key]);
    expect(await storage.head(key)).not.toBeNull(); // deletion happens after commit, not inside the purge
    expect((await db.select().from(schema.attachments)).length).toBe(0);

    expect(await maintenance.drainStorageDeletions()).toEqual({ deleted: 1, failed: 0 });
    expect(await storage.head(key)).toBeNull();
    expect(await queued()).toEqual([]);
  });

  it("leaves the objects of guests that are not expired, and of boards that survive the purge", async () => {
    const fresh = await guestWithAttachment("fresh-guest", 2);
    const shared = await guestWithAttachment("shared-guest", 30);
    await db.insert(schema.user).values({ id: "real", name: "Real", email: "real@x.test", emailVerified: false, isAnonymous: false });
    await db.insert(schema.boardMembers).values({ boardId: sandboxBoardId("shared-guest"), userId: "real", role: "member" });

    expect(await maintenance.purgeExpiredGuests()).toEqual({ users: 1, boards: 0 });
    expect(await queued()).toEqual([]);
    expect(await maintenance.drainStorageDeletions()).toEqual({ deleted: 0, failed: 0 });
    expect(await storage.head(fresh)).not.toBeNull();
    expect(await storage.head(shared)).not.toBeNull();
    expect((await db.select().from(schema.attachments)).length).toBe(2);
  });

  it("a purge that fails after queueing leaves the sandbox, its files and an empty queue", async () => {
    const key = await guestWithAttachment("old-guest", 30);
    await db.execute(sql`CREATE OR REPLACE FUNCTION test_block_user_delete() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'blocked'; END $$ LANGUAGE plpgsql`);
    await db.execute(sql`CREATE TRIGGER test_block_user_delete BEFORE DELETE ON "user" FOR EACH ROW EXECUTE FUNCTION test_block_user_delete()`);
    try {
      await expect(maintenance.purgeExpiredGuests()).rejects.toThrow();
    } finally {
      await db.execute(sql`DROP TRIGGER test_block_user_delete ON "user"`);
    }
    expect(await queued()).toEqual([]);
    expect((await db.select().from(schema.attachments)).length).toBe(1);
    expect(await storage.head(key)).not.toBeNull();
  });

  it("a storage failure keeps the row queued, logs the key without secrets, and a later drain finishes the job", async () => {
    const key = await guestWithAttachment("old-guest", 30);
    await maintenance.purgeExpiredGuests();
    const down = createMaintenance({ db, clock, storage: { ...storage, delete: async () => { throw new Error("storage down"); } } as unknown as LocalStorage, logger: createLogger({ level: "debug", write: (line) => void lines.push(line) }) });
    expect(await down.drainStorageDeletions()).toEqual({ deleted: 0, failed: 1 });
    expect(await queued()).toEqual([key]);
    expect(lines.join("\n")).toContain(key);
    expect(lines.join("\n")).not.toContain("purge-test-secret");
    await db.execute(sql`UPDATE storage_deletions SET next_attempt_at = now() - interval '1 second'`);
    expect(await maintenance.drainStorageDeletions()).toEqual({ deleted: 1, failed: 0 });
    expect(await storage.head(key)).toBeNull();
  });
  describe("sweepPendingUploads (REQ-ATT-06)", () => {
    /** A guest who asked for a ticket `ageMinutes` ago and uploaded the bytes, but never posted the comment. */
    async function abandonedUpload(id: string, ageMinutes: number): Promise<{ key: string; attachmentId: string }> {
      await db.insert(schema.user).values({ id, name: id, email: `${id}@x.test`, emailVerified: false, isAnonymous: true });
      const actor: Actor = { userId: id, isGuest: true };
      await new SeededGuestSandbox(db, { uow: deps.uow, ids: { next: randomUUID }, clock }).provision(actor);
      const [task] = await db.select().from(schema.tasks).where(eq(schema.tasks.boardId, sandboxBoardId(id))).limit(1);
      const then = { now: () => new Date(NOW.getTime() - ageMinutes * 60_000) };
      // The ticket is issued in the past, so the browser's side of the story needs a storage that shares that clock.
      const past = new LocalStorage({ rootDir: root, secret: "purge-test-secret-purge-test-secret", baseUrl: "http://localhost:3000", clock: then });
      const upload = await makeRequestUpload({ ...deps, clock: then }, { storage: past, limiter: new InMemoryRateLimiter(then) })(actor, {
        taskId: task!.id, fileName: "scan.png", contentType: "image/png", size: 4,
      });
      if (upload.ticket.kind !== "local-put") throw new Error("local ticket expected");
      const sent = await past.handle(new Request(upload.ticket.url, { method: "PUT", headers: { "content-type": "image/png" }, body: new Blob([new Uint8Array([1, 2, 3, 4])]) }));
      expect(sent.status).toBe(204);
      return { key: `boards/${sandboxBoardId(id)}/attachments/${upload.attachmentId}`, attachmentId: upload.attachmentId };
    }

    it("queues the key of an upload abandoned for over an hour and deletes its row; the drain removes the object", async () => {
      const stale = await abandonedUpload("stale-guest", 61);
      const recent = await abandonedUpload("recent-guest", 10);
      expect(await maintenance.sweepPendingUploads()).toEqual({ swept: 1 });
      expect(await queued()).toEqual([stale.key]);
      expect((await db.select().from(schema.attachments)).map((a) => a.id)).toEqual([recent.attachmentId]);
      expect(await maintenance.drainStorageDeletions()).toEqual({ deleted: 1, failed: 0 });
      expect(await storage.head(stale.key)).toBeNull();
      expect(await storage.head(recent.key)).not.toBeNull();
      expect(await maintenance.sweepPendingUploads()).toEqual({ swept: 0 });
    });

    it("skips an abandoned row that another transaction holds (a comment linking it right now) instead of waiting", async () => {
      const stale = await abandonedUpload("stale-guest", 90);
      const held = deferred();
      const release = deferred();
      const linking = db.transaction(async (tx) => {
        await tx.execute(sql`SELECT id FROM attachments WHERE id = ${stale.attachmentId} FOR UPDATE`);
        held.resolve();
        await release.promise;
      });
      await held.promise;
      expect(await maintenance.sweepPendingUploads()).toEqual({ swept: 0 });
      release.resolve();
      await linking;
      expect(await queued()).toEqual([]);
      expect(await maintenance.sweepPendingUploads()).toEqual({ swept: 1 });
      expect(await queued()).toEqual([stale.key]);
    });
  });
});

describe("rate limiter housekeeping", () => {
  it("purgeRateLimits deletes windows older than a day and keeps recent ones", async () => {
    const at = (hours: number) => hoursAgo(hours);
    await db.insert(schema.rateLimits).values([
      { key: "old-a", windowStart: at(48), count: 5 },
      { key: "old-b", windowStart: at(25), count: 1 },
      { key: "recent", windowStart: at(23), count: 2 },
      { key: "now", windowStart: at(0), count: 1 },
    ]);
    expect(await maintenance.purgeRateLimits()).toEqual({ purged: 2 });
    const left = (await db.select().from(schema.rateLimits)).map((row) => row.key).sort();
    expect(left).toEqual(["now", "recent"]);
    expect(await maintenance.purgeRateLimits()).toEqual({ purged: 0 });
  });

  it("warmUp touches the database and resolves", async () => {
    await expect(maintenance.warmUp()).resolves.toBeUndefined();
  });
});
