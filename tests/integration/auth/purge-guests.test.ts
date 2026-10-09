import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { SeededGuestSandbox, sandboxBoardId } from "@/infrastructure/auth/guest-sandbox";
import { GUEST_TTL_HOURS, purgeExpiredGuests } from "@/infrastructure/auth/purge-guests";
import { DEMO_BOARD_ID, seedDemoBoard } from "@/infrastructure/seed/seed-demo-board";
import { ensureDemoUsers } from "@/infrastructure/seed/demo-users";
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

const noQueue = async () => undefined; // slice 6 passes the real outbox hook
const seedDemo = async () => {
  await ensureDemoUsers(db);
  await seedDemoBoard({ uow: deps.uow, ids: { next: randomUUID }, clock: deps.clock }, { ownerId: "demo-owner", boardId: DEMO_BOARD_ID });
};
const count = async (table: string) => Number((await db.execute<{ n: number }>(sql.raw(`SELECT count(*)::int AS n FROM "${table}"`))).rows[0]?.n);

describe("purgeExpiredGuests", () => {
  it("keeps the 24 hour TTL of REQ-SEC-04", () => {
    expect(GUEST_TTL_HOURS).toBe(24);
  });

  it("removes guests older than the TTL with their sandbox, tasks and sessions, and nothing else", async () => {
    await guestWithSandbox("old-guest", 25);
    await guestWithSandbox("fresh-guest", 2);
    await addUser("real", { anonymous: false, createdAt: hoursAgo(500) });

    const result = await purgeExpiredGuests(db, { now: NOW, beforeDeleteBoards: noQueue });
    expect(result).toEqual({ users: 1, boards: 1 });

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
    expect(await purgeExpiredGuests(db, { now: NOW, beforeDeleteBoards: noQueue })).toEqual({ users: 0, boards: 0 });
    expect(await purgeExpiredGuests(db, { now: new Date(NOW.getTime() + 1000), beforeDeleteBoards: noQueue })).toMatchObject({ users: 1, boards: 1 });
    expect(await purgeExpiredGuests(db, { now: new Date(NOW.getTime() + 1000), beforeDeleteBoards: noQueue })).toEqual({ users: 0, boards: 0 });
  });

  it("keeps a board a real user belongs to: only the expired guest membership goes, and an ownerless board gets a new owner", async () => {
    await guestWithSandbox("old-guest", 30);
    await addUser("real", { anonymous: false, createdAt: hoursAgo(500) });
    const boardId = sandboxBoardId("old-guest");
    await db.insert(schema.boardMembers).values({ boardId, userId: "real", role: "member" });
    const task = (await db.select().from(schema.tasks).where(eq(schema.tasks.boardId, boardId)))[0]!;
    await db.insert(schema.comments).values({ id: randomUUID(), taskId: task.id, boardId, authorId: "old-guest", body: "hi", createdAt: NOW });

    expect(await purgeExpiredGuests(db, { now: NOW, beforeDeleteBoards: noQueue })).toEqual({ users: 1, boards: 0 });
    expect(await db.select().from(schema.boards).where(eq(schema.boards.id, boardId))).toHaveLength(1);
    expect(await db.select().from(schema.user).where(eq(schema.user.id, "old-guest"))).toHaveLength(0);
    const members = await db.select().from(schema.boardMembers).where(eq(schema.boardMembers.boardId, boardId));
    expect(members.map((m) => [m.userId, m.role]).sort()).toEqual([["demo-viewer", "guest"], ["real", "owner"]]);
    expect((await db.select().from(schema.comments))[0]?.authorId).toBeNull();
    expect(await db.select().from(schema.user).where(eq(schema.user.id, "real"))).toHaveLength(1);
  });

  it("keeps a board that an unexpired guest still uses, and never touches real accounts or the demo board", async () => {
    await guestWithSandbox("old-guest", 30);
    await guestWithSandbox("fresh-guest", 1);
    await addUser("real", { anonymous: false, createdAt: hoursAgo(500) });
    await db.insert(schema.account).values({ id: "a", userId: "real", accountId: "real", providerId: "credential", createdAt: NOW, updatedAt: NOW });
    await db.insert(schema.session).values({ id: "s-real", userId: "real", token: "t-real", expiresAt: NOW, createdAt: NOW, updatedAt: NOW });
    await db.insert(schema.boardMembers).values({ boardId: sandboxBoardId("old-guest"), userId: "fresh-guest", role: "member" });
    await seedDemo();

    expect(await purgeExpiredGuests(db, { now: NOW, beforeDeleteBoards: noQueue })).toEqual({ users: 1, boards: 0 });
    const boards = (await db.select().from(schema.boards)).map((b) => b.id).sort();
    expect(boards).toEqual([DEMO_BOARD_ID, sandboxBoardId("fresh-guest"), sandboxBoardId("old-guest")].sort());
    expect(await count("account")).toBe(1);
    expect((await db.select().from(schema.session)).map((x) => x.userId).sort()).toEqual(["fresh-guest", "real"]);
    expect((await db.select().from(schema.boardMembers).where(eq(schema.boardMembers.boardId, DEMO_BOARD_ID))).length).toBe(2);
  });

  it("refuses to run without the storage cleanup hook, so attachment objects cannot be orphaned", async () => {
    await guestWithSandbox("old-guest", 30);
    await expect(purgeExpiredGuests(db, { now: NOW } as never)).rejects.toThrow(/beforeDeleteBoards/);
    expect(await db.select().from(schema.user).where(eq(schema.user.id, "old-guest"))).toHaveLength(1);
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
