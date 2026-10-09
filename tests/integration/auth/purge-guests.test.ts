import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { SeededGuestSandbox, sandboxBoardId } from "@/infrastructure/auth/guest-sandbox";
import { GUEST_TTL_HOURS, purgeExpiredGuests } from "@/infrastructure/auth/purge-guests";
import * as schema from "@/infrastructure/db/schema";
import { connectTestDb, resetDb } from "../support/db";
import { drizzleDeps } from "../support/tx";

const handle = connectTestDb();
const { db } = handle;
const deps = drizzleDeps(handle);
const NOW = new Date("2026-10-10T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);
beforeEach(() => resetDb(handle));
afterAll(() => handle.close());

async function addUser(id: string, opts: { anonymous: boolean; createdAt: Date }) {
  await db.insert(schema.user).values({
    id, name: id, email: `${id}@x.test`, emailVerified: false, isAnonymous: opts.anonymous, createdAt: opts.createdAt, updatedAt: opts.createdAt,
  });
}

async function guestWithSandbox(id: string, ageHours: number) {
  await addUser(id, { anonymous: true, createdAt: hoursAgo(ageHours) });
  await new SeededGuestSandbox(db, { uow: deps.uow, ids: { next: randomUUID }, clock: deps.clock }).provision({ userId: id, isGuest: true });
  await db.insert(schema.session).values({ id: `s-${id}`, userId: id, token: `t-${id}`, expiresAt: NOW, createdAt: NOW, updatedAt: NOW });
}

const count = async (table: string) => Number((await db.execute<{ n: number }>(sql.raw(`SELECT count(*)::int AS n FROM "${table}"`))).rows[0]?.n);

describe("purgeExpiredGuests", () => {
  it("keeps the 24 hour TTL of REQ-SEC-04", () => {
    expect(GUEST_TTL_HOURS).toBe(24);
  });

  it("removes guests older than the TTL with their sandbox, tasks and sessions, and nothing else", async () => {
    await guestWithSandbox("old-guest", 25);
    await guestWithSandbox("fresh-guest", 2);
    await addUser("real", { anonymous: false, createdAt: hoursAgo(500) });

    const result = await purgeExpiredGuests(db, { now: NOW });
    expect(result).toEqual({ users: 1, boards: 1, skipped: 0 });

    const users = (await db.select().from(schema.user)).map((u) => u.id).sort();
    expect(users).toEqual(["demo-owner", "demo-viewer", "fresh-guest", "real"]);
    const boards = (await db.select().from(schema.boards)).map((b) => b.id);
    expect(boards).toEqual([sandboxBoardId("fresh-guest")]);
    expect((await db.select().from(schema.session)).map((s) => s.userId)).toEqual(["fresh-guest"]);
    expect(await count("tasks")).toBeGreaterThan(0);
    expect((await db.select().from(schema.tasks)).every((t) => t.boardId === sandboxBoardId("fresh-guest"))).toBe(true);
  });

  it("is idempotent and exact at the TTL boundary", async () => {
    await guestWithSandbox("edge", GUEST_TTL_HOURS); // exactly 24h old: not yet expired
    expect(await purgeExpiredGuests(db, { now: NOW })).toEqual({ users: 0, boards: 0, skipped: 0 });
    expect(await purgeExpiredGuests(db, { now: new Date(NOW.getTime() + 1000) })).toMatchObject({ users: 1, boards: 1 });
    expect(await purgeExpiredGuests(db, { now: new Date(NOW.getTime() + 1000) })).toEqual({ users: 0, boards: 0, skipped: 0 });
  });

  it("never deletes a board a real user still owns, nor a guest whose comments live on a surviving board", async () => {
    await guestWithSandbox("old-guest", 30);
    await addUser("real", { anonymous: false, createdAt: hoursAgo(500) });
    const boardId = sandboxBoardId("old-guest");
    await db.insert(schema.boardMembers).values({ boardId, userId: "real", role: "owner" });
    expect(await purgeExpiredGuests(db, { now: NOW })).toMatchObject({ boards: 0 });
    expect(await db.select().from(schema.boards).where(eq(schema.boards.id, boardId))).toHaveLength(1);
    // The guest owns nothing exclusively now, but stays as a co-owner member; the user is still removed (membership cascades).
    expect((await db.select().from(schema.user).where(eq(schema.user.id, "old-guest"))).length).toBe(0);

    await guestWithSandbox("commenter", 30);
    const task = (await db.select().from(schema.tasks).where(eq(schema.tasks.boardId, sandboxBoardId("commenter"))))[0]!;
    await db.insert(schema.boardMembers).values({ boardId, userId: "commenter", role: "member" });
    const pipeline = (await db.select().from(schema.pipelines).where(eq(schema.pipelines.boardId, boardId)))[0]!;
    const stage = (await db.select().from(schema.stages).where(eq(schema.stages.pipelineId, pipeline.id)))[0]!;
    const onSurvivor = { ...task, id: randomUUID(), boardId, pipelineId: pipeline.id, stageId: stage.id, assigneeId: null };
    await db.insert(schema.tasks).values(onSurvivor);
    await db.insert(schema.comments).values({ id: randomUUID(), taskId: onSurvivor.id, boardId, authorId: "commenter", body: "hi", createdAt: NOW });
    const result = await purgeExpiredGuests(db, { now: NOW });
    expect(result.skipped).toBe(1);
    expect((await db.select().from(schema.user).where(eq(schema.user.id, "commenter"))).length).toBe(1);
  });

  it("lets the caller queue storage cleanup inside the same transaction, and rolls everything back if it fails", async () => {
    await guestWithSandbox("old-guest", 30);
    const seen: string[][] = [];
    await purgeExpiredGuests(db, { now: NOW, beforeDeleteBoards: async (_tx, ids) => void seen.push(ids) });
    expect(seen).toEqual([[sandboxBoardId("old-guest")]]);

    await guestWithSandbox("old-guest-2", 30);
    await expect(purgeExpiredGuests(db, { now: NOW, beforeDeleteBoards: async () => { throw new Error("queue down"); } })).rejects.toThrow("queue down");
    expect(await db.select().from(schema.user).where(eq(schema.user.id, "old-guest-2"))).toHaveLength(1);
    expect(await db.select().from(schema.boards).where(eq(schema.boards.id, sandboxBoardId("old-guest-2")))).toHaveLength(1);
  });
});
