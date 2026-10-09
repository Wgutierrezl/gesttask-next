import { beforeEach, describe, expect, it } from "vitest";
import { ValidationError } from "@/domain/errors";
import type { Repos } from "@/application/ports/repositories";
import { createTestContext, type TestContext } from "@tests/support/app-context";
import { makeCreateBoard } from "./create-board";
import { makeListMyBoards } from "./list-my-boards";

const alice = { userId: "alice", isGuest: false };
const bob = { userId: "bob", isGuest: false };

describe("createBoard", () => {
  let ctx: TestContext;
  beforeEach(() => void (ctx = createTestContext()));

  it("creates the board and makes the creator its owner", async () => {
    const board = await makeCreateBoard(ctx)(alice, { name: "  Roadmap ", description: "Q4" });
    expect(board).toMatchObject({ name: "Roadmap", description: "Q4", status: "active" });
    expect(board).not.toHaveProperty("ownerId");
    expect(board.createdAt).toEqual(ctx.clock.now());
    expect(await ctx.repos.members.find(board.id, "alice")).toEqual({ boardId: board.id, userId: "alice", role: "owner" });
  });

  it("defaults the description to an empty string", async () => {
    expect((await makeCreateBoard(ctx)(alice, { name: "x" })).description).toBe("");
  });

  it.each([{}, { name: "" }, { name: "   " }, { name: "x".repeat(101) }, { name: "x", description: "d".repeat(2001) }])(
    "rejects invalid input %o without persisting anything",
    async (input) => {
      await expect(makeCreateBoard(ctx)(alice, input)).rejects.toBeInstanceOf(ValidationError);
      expect(ctx.store.boards.size).toBe(0);
    },
  );

  it("leaves no board behind when the owner membership fails (REQ-BRD-01)", async () => {
    const failing = {
      ...ctx,
      uow: {
        run: <T>(work: (repos: Repos) => Promise<T>) =>
          ctx.uow.run((tx) =>
            work({ ...tx, members: { ...tx.members, insert: () => Promise.reject(new Error("db down")) } }),
          ),
      },
    };
    await expect(makeCreateBoard(failing)(alice, { name: "x" })).rejects.toThrow("db down");
    expect(ctx.store.boards.size).toBe(0);
  });
});

describe("listMyBoards", () => {
  it("returns an empty list, not an error or null, when the user has no boards (REQ-BRD-02)", async () => {
    const ctx = createTestContext();
    await expect(makeListMyBoards(ctx)(alice)).resolves.toEqual([]);
  });

  it("returns only the boards the actor belongs to", async () => {
    const ctx = createTestContext();
    const mine = await makeCreateBoard(ctx)(alice, { name: "mine" });
    await makeCreateBoard(ctx)(bob, { name: "theirs" });
    const list = await makeListMyBoards(ctx)(alice);
    expect(list.map((b) => b.id)).toEqual([mine.id]);
  });
});
