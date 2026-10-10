import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { sandboxBoardId, SeededGuestSandbox } from "@/infrastructure/auth/guest-sandbox";
import { transferGuestData } from "@/infrastructure/auth/transfer-guest";
import type { Database } from "@/infrastructure/db/client";
import * as schema from "@/infrastructure/db/schema";
import { createLogger } from "@/infrastructure/logging/logger";
import { connectTestDb, resetDb } from "../support/db";
import { drizzleDeps } from "../support/tx";

const handle = connectTestDb();
const { db } = handle;
const deps = drizzleDeps(handle);
const NOW = new Date("2026-10-10T12:00:00Z");
beforeEach(() => resetDb(handle));
afterAll(() => handle.close());

const addUser = (id: string, anonymous: boolean) =>
  db.insert(schema.user).values({ id, name: id, email: `${id}@x.test`, emailVerified: false, isAnonymous: anonymous, createdAt: NOW, updatedAt: NOW });
const memberships = async (userId: string) =>
  (await db.select().from(schema.boardMembers).where(eq(schema.boardMembers.userId, userId))).map((m) => [m.boardId, m.role]);

describe("transferGuestData", () => {
  it("makes the account the owner of a board it already belonged to, without duplicate owners", async () => {
    await addUser("guest", true);
    await addUser("account", false);
    await new SeededGuestSandbox(db, { uow: deps.uow, ids: { next: randomUUID }, clock: deps.clock }).provision({ userId: "guest", isGuest: true });
    const shared = sandboxBoardId("guest");
    // The guest invited the account before registering with it, and owns a second board too.
    await db.insert(schema.boardMembers).values({ boardId: shared, userId: "account", role: "member" });
    const second = (await deps.uow.run(async (tx) => {
      const board = { id: randomUUID(), name: "second", description: "", status: "active" as const, createdAt: NOW };
      await tx.boards.insert(board);
      await tx.members.insert({ boardId: board.id, userId: "guest", role: "owner" });
      return board;
    })).id;

    await transferGuestData(db, "guest", "account", createLogger({ level: "error", write: () => undefined }));

    expect(await memberships("guest")).toEqual([]);
    expect((await memberships("account")).sort()).toEqual([[shared, "owner"], [second, "owner"]].sort());
    const owners = await db.select().from(schema.boardMembers).where(eq(schema.boardMembers.role, "owner"));
    expect(owners.filter((o) => o.boardId === shared)).toHaveLength(1);
  });

  it("keeps a higher existing role of the account instead of downgrading it", async () => {
    await addUser("guest", true);
    await addUser("account", false);
    const board = { id: randomUUID(), name: "b", description: "", status: "active" as const, createdAt: NOW };
    await deps.uow.run(async (tx) => {
      await tx.boards.insert(board);
      await tx.members.insert({ boardId: board.id, userId: "account", role: "owner" });
      await tx.members.insert({ boardId: board.id, userId: "guest", role: "member" });
    });
    await transferGuestData(db, "guest", "account", createLogger({ level: "error", write: () => undefined }));
    expect(await memberships("account")).toEqual([[board.id, "owner"]]);
    expect(await memberships("guest")).toEqual([]);
  });

  it("logs a failure with the user ids and no secrets, and does not fail the sign-up that triggered it", async () => {
    const logs: string[] = [];
    const broken = { transaction: async () => { throw new Error("connection reset"); } } as unknown as Database;
    await expect(transferGuestData(broken, "guest-1", "account-1", createLogger({ level: "debug", write: (line) => logs.push(line) }))).resolves.toBeUndefined();
    const entry = JSON.parse(logs.join("\n")) as Record<string, unknown>;
    expect(entry.level).toBe("error");
    expect(entry.msg).toBe("guest data transfer failed");
    expect(JSON.stringify(entry)).toContain("guest-1");
    expect(JSON.stringify(entry)).toContain("connection reset");
    expect(JSON.stringify(entry)).not.toMatch(/stack|at .*\.ts/);
  });
});
