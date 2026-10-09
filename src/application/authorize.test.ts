import { beforeEach, describe, expect, it } from "vitest";
import { ForbiddenError, NotFoundError } from "@/domain/errors";
import { BOARD_ACTIONS, can } from "@/domain/policy/board-policy";
import { BOARD_ROLES } from "@/domain/value-objects/board-role";
import { createTestContext, type TestContext } from "@tests/support/app-context";
import { requireBoardAccess } from "./authorize";

describe("requireBoardAccess", () => {
  let ctx: TestContext;
  const board = "00000000-0000-4000-8000-0000000000b1";

  beforeEach(async () => {
    ctx = createTestContext();
    await ctx.repos.boards.insert({ id: board, name: "b", description: "", status: "active", createdAt: new Date() });
    for (const role of BOARD_ROLES) {
      await ctx.repos.members.insert({ boardId: board, userId: role, role });
    }
  });

  const actor = (userId: string) => ({ userId, isGuest: false });

  it.each(BOARD_ROLES.flatMap((role) => BOARD_ACTIONS.map((action) => [role, action] as const)))(
    "%s + %s follows the policy table",
    async (role, action) => {
      const result = requireBoardAccess(ctx.repos.members, actor(role), board, action);
      if (can(role, action)) await expect(result).resolves.toBe(role);
      else await expect(result).rejects.toBeInstanceOf(ForbiddenError);
    },
  );

  it("answers NotFound to non-members, whatever the action", async () => {
    for (const action of BOARD_ACTIONS) {
      await expect(requireBoardAccess(ctx.repos.members, actor("stranger"), board, action)).rejects.toBeInstanceOf(
        NotFoundError,
      );
    }
  });

  it("makes unknown and foreign boards indistinguishable", async () => {
    const foreign = await requireBoardAccess(ctx.repos.members, actor("stranger"), board, "board:view").catch((e) => e);
    const unknown = await requireBoardAccess(ctx.repos.members, actor("stranger"), "no-such-board", "board:view").catch(
      (e) => e,
    );
    expect(foreign).toBeInstanceOf(NotFoundError);
    expect(unknown).toEqual(foreign);
  });
});
