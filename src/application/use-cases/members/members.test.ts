import { beforeEach, describe, expect, it } from "vitest";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/domain/errors";
import { createTestContext, type TestContext } from "@tests/support/app-context";
import { GUEST, MEMBER, OWNER, RIVAL, STRANGER, actor, seedBoard, seedKanban } from "@tests/support/fixtures";
import { makeCreateStage } from "../stages/create-stage";
import { makeCreatePipeline } from "../pipelines/create-pipeline";
import { makeCreateTask } from "../tasks/create-task";
import { makeAddMember } from "./add-member";
import { makeChangeMemberRole } from "./change-member-role";
import { makeListMembers } from "./list-members";
import { makeListMyMemberships } from "./list-my-memberships";
import { makeRemoveMember } from "./remove-member";

describe("members", () => {
  let ctx: TestContext;
  let boardId: string;
  beforeEach(async () => {
    ctx = createTestContext();
    ({ boardId } = await seedBoard(ctx));
  });

  it("lets the owner add a member and rejects a duplicate with Conflict (REQ-BRD-03)", async () => {
    const added = await makeAddMember(ctx)(OWNER, { boardId, userId: "carol", role: "member" });
    expect(added).toEqual({ boardId, userId: "carol", role: "member" });
    await expect(makeAddMember(ctx)(OWNER, { boardId, userId: "carol", role: "guest" })).rejects.toBeInstanceOf(
      ConflictError,
    );
    expect((await ctx.repos.members.find(boardId, "carol"))?.role).toBe("member");
  });

  it("validates the role", async () => {
    await expect(makeAddMember(ctx)(OWNER, { boardId, userId: "carol", role: "admin" })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it.each([
    ["member", MEMBER, ForbiddenError],
    ["guest", GUEST, ForbiddenError],
    ["stranger", STRANGER, NotFoundError],
  ] as const)("denies %s every management action with no effect", async (_l, who, error) => {
    await expect(makeAddMember(ctx)(who, { boardId, userId: "carol", role: "member" })).rejects.toBeInstanceOf(error);
    await expect(makeRemoveMember(ctx)(who, { boardId, userId: MEMBER.userId })).rejects.toBeInstanceOf(error);
    await expect(
      makeChangeMemberRole(ctx)(who, { boardId, userId: MEMBER.userId, role: "owner" }),
    ).rejects.toBeInstanceOf(error);
    expect(ctx.store.members.size).toBe(3);
  });

  it("removes a member and changes a role", async () => {
    const changed = await makeChangeMemberRole(ctx)(OWNER, { boardId, userId: MEMBER.userId, role: "guest" });
    expect(changed.role).toBe("guest");
    await makeRemoveMember(ctx)(OWNER, { boardId, userId: MEMBER.userId });
    expect(await ctx.repos.members.find(boardId, MEMBER.userId)).toBeNull();
  });

  it("unassigns the removed member's tasks on this board only, in the same transaction", async () => {
    const k = await seedKanban(ctx);
    const other = await seedBoard(ctx);
    const otherPipeline = await makeCreatePipeline(ctx)(OWNER, { boardId: other.boardId, name: "Q" });
    const otherStage = await makeCreateStage(ctx)(OWNER, { pipelineId: otherPipeline.id, name: "S" });
    const mine = await makeCreateTask(ctx)(OWNER, { stageId: k.todoId, title: "mine", assigneeId: "member" });
    const kept = await makeCreateTask(ctx)(OWNER, { stageId: k.todoId, title: "kept", assigneeId: "guest" });
    const elsewhere = await makeCreateTask(ctx)(OWNER, { stageId: otherStage.id, title: "elsewhere", assigneeId: "member" });
    await makeRemoveMember(ctx)(OWNER, { boardId: k.boardId, userId: "member" });
    expect((await ctx.repos.tasks.findById(mine.id))?.assigneeId).toBeNull();
    expect((await ctx.repos.tasks.findById(kept.id))?.assigneeId).toBe("guest");
    expect((await ctx.repos.tasks.findById(elsewhere.id))?.assigneeId).toBe("member");
  });

  it("keeps assignees when the removal itself is rejected", async () => {
    const k = await seedKanban(ctx);
    const task = await makeCreateTask(ctx)(OWNER, { stageId: k.todoId, title: "mine", assigneeId: "owner" });
    await expect(makeRemoveMember(ctx)(OWNER, { boardId: k.boardId, userId: "owner" })).rejects.toBeInstanceOf(ConflictError);
    expect((await ctx.repos.tasks.findById(task.id))?.assigneeId).toBe("owner");
  });

  it("rolls the membership removal back when unassigning the member's tasks fails", async () => {
    const k = await seedKanban(ctx);
    const task = await makeCreateTask(ctx)(OWNER, { stageId: k.todoId, title: "mine", assigneeId: "member" });
    const failing: TestContext = {
      ...ctx,
      uow: {
        run: (work) =>
          ctx.uow.run((tx) =>
            work({ ...tx, tasks: { ...tx.tasks, clearAssignee: () => Promise.reject(new Error("boom")) } }),
          ),
      },
    };
    await expect(makeRemoveMember(failing)(OWNER, { boardId: k.boardId, userId: "member" })).rejects.toThrow("boom");
    expect(await ctx.repos.members.find(k.boardId, "member")).not.toBeNull();
    expect((await ctx.repos.tasks.findById(task.id))?.assigneeId).toBe("member");
  });

  it("answers NotFound when the target is not a member", async () => {
    await expect(makeRemoveMember(ctx)(OWNER, { boardId, userId: "ghost" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      makeChangeMemberRole(ctx)(OWNER, { boardId, userId: "ghost", role: "member" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("protects the only owner from removal and demotion (REQ-BRD-04)", async () => {
    await expect(makeRemoveMember(ctx)(OWNER, { boardId, userId: OWNER.userId })).rejects.toBeInstanceOf(ConflictError);
    await expect(
      makeChangeMemberRole(ctx)(OWNER, { boardId, userId: OWNER.userId, role: "member" }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect((await ctx.repos.members.find(boardId, OWNER.userId))?.role).toBe("owner");
  });

  it("allows an owner to step down once another owner exists", async () => {
    await makeChangeMemberRole(ctx)(OWNER, { boardId, userId: MEMBER.userId, role: "owner" });
    await makeChangeMemberRole(ctx)(OWNER, { boardId, userId: OWNER.userId, role: "member" });
    await makeRemoveMember(ctx)(MEMBER, { boardId, userId: OWNER.userId });
    expect(await ctx.repos.members.countByRole(boardId, "owner")).toBe(1);
  });

  it("treats a role change to the same role as a no-op", async () => {
    const same = await makeChangeMemberRole(ctx)(OWNER, { boardId, userId: OWNER.userId, role: "owner" });
    expect(same.role).toBe("owner");
  });

  it("lets every role list members but hides them from strangers", async () => {
    for (const who of [OWNER, MEMBER, GUEST]) {
      expect(await makeListMembers(ctx)(who, { boardId })).toHaveLength(3);
    }
    await expect(makeListMembers(ctx)(STRANGER, { boardId })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("lists only the actor's own memberships and takes no user id (REQ-ISO-05)", async () => {
    const mine = await makeListMyMemberships(ctx)(actor("member"));
    expect(mine).toEqual([{ boardId, userId: "member", role: "member" }]);
    expect(makeListMyMemberships(ctx).length).toBe(1);
    expect(await makeListMyMemberships(ctx)(STRANGER)).toEqual([]);
  });

  it("can narrow the memberships to the boards on screen, and never reveals anyone else's", async () => {
    const other = (await seedBoard(ctx, RIVAL)).boardId;
    const mine = (ids: string[]) => makeListMyMemberships(ctx)(actor("member"), { boardIds: ids });
    expect(await mine([boardId])).toEqual([{ boardId, userId: "member", role: "member" }]);
    expect(await mine([boardId, other])).toHaveLength(2);
    expect(await makeListMyMemberships(ctx)(OWNER, { boardIds: [boardId, other] })).toEqual([{ boardId, userId: "owner", role: "owner" }]);
    expect(await mine([])).toEqual([]);
    await expect(mine(["nope"])).rejects.toBeInstanceOf(ValidationError);
    await expect(mine(Array.from({ length: 201 }, () => boardId))).rejects.toBeInstanceOf(ValidationError);
  });
});
