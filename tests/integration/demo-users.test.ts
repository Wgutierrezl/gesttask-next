import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ensureDemoUsers } from "@/infrastructure/seed/demo-users";
import { DEMO_BOARD_ID, DEMO_OWNER_ID, DEMO_VIEWER_ID, seedDemoBoard } from "@/infrastructure/seed/seed-demo-board";
import * as t from "@/infrastructure/db/schema";
import { withoutAutoUsers } from "./support/auto-users";
import { connectTestDb, resetDb } from "./support/db";
import { drizzleDeps } from "./support/tx";

const handle = connectTestDb();
beforeEach(() => resetDb(handle));
afterAll(() => handle.close());

describe("ensureDemoUsers", () => {
  it("creates the two login-less demo users once, however often it runs", async () => {
    await ensureDemoUsers(handle.db);
    await ensureDemoUsers(handle.db);
    const users = await handle.db.select().from(t.user).orderBy(t.user.id);
    expect(users.map((u) => u.id)).toEqual([DEMO_OWNER_ID, DEMO_VIEWER_ID]);
    expect(users.every((u) => u.isAnonymous === false && u.email.endsWith("@demo.invalid"))).toBe(true);
    expect(await handle.db.select().from(t.account)).toEqual([]);
  });

  it("is enough for the demo board to seed against the real foreign keys", async () => {
    await withoutAutoUsers(handle, async () => {
      await ensureDemoUsers(handle.db);
      const deps = drizzleDeps(handle);
      const result = await seedDemoBoard({ ...deps, ids: { next: randomUUID } }, { ownerId: DEMO_OWNER_ID, boardId: DEMO_BOARD_ID });
      expect(result.created).toBe(true);
    });
  });
});
