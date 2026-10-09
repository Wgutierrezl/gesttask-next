import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { makeListMyBoards } from "@/application/use-cases/boards/list-my-boards";
import { makeGetTask } from "@/application/use-cases/tasks/get-task";
import { NotFoundError } from "@/domain/errors";
import { SeededGuestSandbox, sandboxBoardId } from "@/infrastructure/auth/guest-sandbox";
import * as schema from "@/infrastructure/db/schema";
import { DEMO_VIEWER_ID } from "@/infrastructure/seed/seed-demo-board";
import { connectTestDb, resetDb } from "../support/db";
import { drizzleDeps } from "../support/tx";
import { authFixture, cookieHeader } from "../support/auth";

const handle = connectTestDb();
const deps = drizzleDeps(handle);
const sandbox = () => new SeededGuestSandbox(handle.db, { uow: deps.uow, ids: { next: randomUUID }, clock: deps.clock });
beforeEach(() => resetDb(handle));
afterAll(() => handle.close());

async function newGuest(): Promise<{ userId: string; isGuest: true }> {
  const { auth } = authFixture(handle);
  const response = await auth.api.signInAnonymous();
  return { userId: response!.user.id, isGuest: true };
}

describe("SeededGuestSandbox", () => {
  it("clones the demo board for the guest, who owns it, with the viewer showing the guest role", async () => {
    const guest = await newGuest();
    await sandbox().provision(guest);
    const boards = await makeListMyBoards(deps)(guest);
    expect(boards).toHaveLength(1);
    const members = await deps.repos.members.listByBoard(boards[0]!.id, { limit: 50, offset: 0 });
    expect(members.map((m) => [m.userId, m.role]).sort()).toEqual([[DEMO_VIEWER_ID, "guest"], [guest.userId, "owner"]].sort());
    const tasks = await handle.db.select().from(schema.tasks).where(eq(schema.tasks.boardId, boards[0]!.id));
    expect(tasks.length).toBeGreaterThanOrEqual(5);
    expect(tasks.some((t) => t.assigneeId === guest.userId)).toBe(true);
  });

  it("reports whether the guest owns any board, and is false again once the sandbox is deleted", async () => {
    const guest = await newGuest();
    expect(await sandbox().hasBoards(guest)).toBe(false);
    await sandbox().provision(guest);
    expect(await sandbox().hasBoards(guest)).toBe(true);
    await handle.db.delete(schema.boards).where(eq(schema.boards.id, sandboxBoardId(guest.userId)));
    expect(await sandbox().hasBoards(guest)).toBe(false);
  });

  it("is idempotent, even when provisioned concurrently", async () => {
    const guest = await newGuest();
    await Promise.all([1, 2, 3].map(() => sandbox().provision(guest)));
    await sandbox().provision(guest);
    expect(await makeListMyBoards(deps)(guest)).toHaveLength(1);
    expect((await makeListMyBoards(deps)(guest))[0]!.id).toBe(sandboxBoardId(guest.userId));
  });

  it("gives every guest a private copy that other guests cannot see or read", async () => {
    const [a, b] = [await newGuest(), await newGuest()];
    await sandbox().provision(a);
    await sandbox().provision(b);
    const [boardA] = await makeListMyBoards(deps)(a);
    const [boardB] = await makeListMyBoards(deps)(b);
    expect(boardA!.id).not.toBe(boardB!.id);
    const taskOfA = (await handle.db.select().from(schema.tasks).where(eq(schema.tasks.boardId, boardA!.id)))[0]!;
    await expect(makeGetTask(deps)(b, { taskId: taskOfA.id })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("linking a guest to a real account", () => {
  it("moves the sandbox to the account the guest signs up with", async () => {
    const { auth } = authFixture(handle, {
      onLinkAccount: async (link) => (await import("@/infrastructure/auth/transfer-guest")).transferGuestData(handle.db, link.guestUserId, link.userId),
    });
    const anonymous = await auth.api.signInAnonymous({ returnHeaders: true });
    const guest = { userId: anonymous.response!.user.id, isGuest: true as const };
    await sandbox().provision(guest);

    const signedUp = await auth.api.signUpEmail({
      body: { email: "grace@example.com", password: "a long enough password", name: "Grace" },
      headers: cookieHeader(anonymous.headers),
    });
    const account = { userId: signedUp.user.id, isGuest: false };
    const mine = await makeListMyBoards(deps)(account);
    expect(mine.map((b) => b.id)).toEqual([sandboxBoardId(guest.userId)]);
    expect(await makeListMyBoards(deps)(guest)).toEqual([]);
    const tasks = await handle.db.select().from(schema.tasks).where(eq(schema.tasks.boardId, mine[0]!.id));
    expect(tasks.some((t) => t.assigneeId === account.userId)).toBe(true);
    expect(tasks.some((t) => t.assigneeId === guest.userId)).toBe(false);
  });
});
