import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ConflictError } from "@/domain/errors";
import { makeCreateBoard } from "@/application/use-cases/boards/create-board";
import { GUEST_MAX_BOARDS } from "@/application/guest-quota";
import { connectTestDb, resetDb } from "../support/db";
import { drizzleDeps } from "../support/tx";

const handle = connectTestDb();
const deps = drizzleDeps(handle);
beforeEach(() => resetDb(handle));
afterAll(() => handle.close());

describe("guest board quota on Postgres", () => {
  it("lets a guest own 3 boards, refuses the 4th, and leaves real users unrestricted", async () => {
    const guest = { userId: "guest-1", isGuest: true };
    for (let i = 0; i < GUEST_MAX_BOARDS; i++) await makeCreateBoard(deps)(guest, { name: `b${i}` });
    await expect(makeCreateBoard(deps)(guest, { name: "extra" })).rejects.toBeInstanceOf(ConflictError);
    expect(await deps.repos.members.listByUser("guest-1")).toHaveLength(GUEST_MAX_BOARDS);
    for (let i = 0; i < 5; i++) await makeCreateBoard(deps)({ userId: "real", isGuest: false }, { name: `r${i}` });
    expect(await deps.repos.members.listByUser("real")).toHaveLength(5);
  });
});
