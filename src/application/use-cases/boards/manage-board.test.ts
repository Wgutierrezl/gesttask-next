import { beforeEach, describe, expect, it } from "vitest";
import { ForbiddenError, NotFoundError, ValidationError } from "@/domain/errors";
import { createTestContext, type TestContext } from "@tests/support/app-context";
import { GUEST, MEMBER, OWNER, STRANGER, seedBoard } from "@tests/support/fixtures";
import { makeDeleteBoard } from "./delete-board";
import { makeUpdateBoard } from "./update-board";

describe("updateBoard / deleteBoard", () => {
  let ctx: TestContext;
  let boardId: string;
  beforeEach(async () => {
    ctx = createTestContext();
    ({ boardId } = await seedBoard(ctx));
  });

  it("lets the owner update only the given fields", async () => {
    const board = await makeUpdateBoard(ctx)(OWNER, { boardId, name: "Renamed", status: "inactive" });
    expect(board).toMatchObject({ id: boardId, name: "Renamed", status: "inactive", description: "" });
    expect((await ctx.repos.boards.findById(boardId))?.name).toBe("Renamed");
  });

  it("keeps unchanged fields when only the description is sent", async () => {
    const board = await makeUpdateBoard(ctx)(OWNER, { boardId, description: "New" });
    expect(board).toMatchObject({ name: "Board", description: "New", status: "active" });
  });

  it("answers NotFound when the board row vanished under a stale membership", async () => {
    ctx.store.boards.delete(boardId);
    await expect(makeUpdateBoard(ctx)(OWNER, { boardId, name: "x" })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rejects an invalid status value", async () => {
    await expect(makeUpdateBoard(ctx)(OWNER, { boardId, status: "archived" })).rejects.toBeInstanceOf(ValidationError);
  });

  it.each([
    ["member", MEMBER, ForbiddenError],
    ["guest", GUEST, ForbiddenError],
    ["stranger", STRANGER, NotFoundError],
  ] as const)("denies %s on update and delete without side effects", async (_label, who, error) => {
    await expect(makeUpdateBoard(ctx)(who, { boardId, name: "Hacked" })).rejects.toBeInstanceOf(error);
    await expect(makeDeleteBoard(ctx)(who, { boardId })).rejects.toBeInstanceOf(error);
    expect((await ctx.repos.boards.findById(boardId))?.name).toBe("Board");
  });

  it("deletes the board and its memberships for the owner", async () => {
    await makeDeleteBoard(ctx)(OWNER, { boardId });
    expect(await ctx.repos.boards.findById(boardId)).toBeNull();
    expect(ctx.store.members.size).toBe(0);
  });

  it("answers NotFound for a board that does not exist, same as a foreign one", async () => {
    const missing = "00000000-0000-4000-8000-0000000000ff";
    await expect(makeDeleteBoard(ctx)(OWNER, { boardId: missing })).rejects.toBeInstanceOf(NotFoundError);
  });
});
