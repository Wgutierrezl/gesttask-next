import { APIError } from "better-auth/api";
import { describe, expect, it } from "vitest";
import { assertGuestAttachmentQuota, assertGuestBoardQuota, assertGuestTaskQuota, GUEST_MAX_ATTACHMENTS, GUEST_MAX_BOARDS, GUEST_MAX_TASKS } from "@/application/guest-quota";
import { makeDeleteStage } from "@/application/use-cases/stages/delete-stage";
import { assertNotLastOwner } from "@/application/use-cases/members/_last-owner";
import { assertAssigneeIsMember } from "@/application/use-cases/tasks/_assignee";
import { translateAuthError } from "@/infrastructure/auth/auth-port";
import { translateDbError } from "@/infrastructure/repos/drizzle-errors";
import { createTestContext } from "@tests/support/app-context";
import { buildTask, OWNER, seedKanban } from "@tests/support/fixtures";

/** What a throw site declares so the web adapter can translate it: the reason and the values it interpolates. */
async function detailOf(work: () => unknown) {
  try {
    await work();
  } catch (error) {
    const { reason, params, fieldReasons } = error as { reason?: string; params?: unknown; fieldReasons?: unknown };
    return { reason, params, fieldReasons };
  }
  throw new Error("expected a throw");
}

const guest = { userId: "g", isGuest: true };
const NOW = new Date("2026-10-09T12:00:00Z");

describe("guest quotas", () => {
  const members = (count: number) => ({ lockUserQuota: async () => {}, listByUser: async () => Array.from({ length: count }, (_, i) => ({ boardId: `b${i}`, role: "owner" })) }) as never;

  it("name the limit that was hit", async () => {
    expect(await detailOf(() => assertGuestBoardQuota(members(GUEST_MAX_BOARDS), guest))).toMatchObject({ reason: "guest.boardLimit", params: { max: GUEST_MAX_BOARDS } });
    expect(await detailOf(() => assertGuestTaskQuota({ members: members(1), tasks: { countByBoards: async () => GUEST_MAX_TASKS } as never }, guest))).toMatchObject({ reason: "guest.taskLimit", params: { max: GUEST_MAX_TASKS } });
    expect(await detailOf(() => assertGuestAttachmentQuota({ members: members(1), attachments: { countByUploader: async () => GUEST_MAX_ATTACHMENTS } as never }, guest, NOW))).toMatchObject({ reason: "guest.attachmentLimit", params: { max: GUEST_MAX_ATTACHMENTS } });
  });
});

describe("use case refusals", () => {
  it("name the member and assignee rules", async () => {
    expect((await detailOf(() => assertNotLastOwner(1, { boardId: "b", userId: "u", role: "owner" }))).reason).toBe("member.lastOwner");
    expect(await detailOf(() => assertAssigneeIsMember({ find: async () => null } as never, "b", "u"))).toMatchObject({ fieldReasons: { assigneeId: [{ reason: "assigneeId.notMember" }] } });
  });

  it("name each way a stage deletion is refused", async () => {
    const ctx = createTestContext();
    const k = await seedKanban(ctx);
    const deleteStage = makeDeleteStage(ctx);
    ctx.store.tasks.set("t1", buildTask({ id: "t1", stageId: k.todoId, pipelineId: k.pipelineId, boardId: k.boardId }));
    expect((await detailOf(() => deleteStage(OWNER, { stageId: k.doneId }))).reason).toBe("stage.doneCannotDelete");
    expect((await detailOf(() => deleteStage(OWNER, { stageId: k.todoId }))).reason).toBe("stage.hasTasks");
    expect((await detailOf(() => deleteStage(OWNER, { stageId: k.todoId, moveToStageId: k.todoId }))).reason).toBe("stage.sameDestination");
  });
});

describe("infrastructure refusals", () => {
  const pg = (code: string, constraint: string) => new Error("db", { cause: { code, constraint } });

  it.each([
    ["board_members_board_id_user_id_pk", "member.alreadyMember"],
    ["stages_pipeline_lower_name_uq", "stage.nameTaken"],
    ["stages_pipeline_done_uq", "stage.doneExists"],
  ])("translateDbError names the %s conflict", (constraint, reason) => {
    expect((translateDbError(pg("23505", constraint)) as { reason?: string }).reason).toBe(reason);
  });

  it("translateDbError leaves the generic board conflict to the code default", () => {
    expect((translateDbError(pg("23505", "boards_pkey")) as { reason?: string }).reason).toBeUndefined();
  });

  it.each([
    ["duplicate account", new APIError("UNPROCESSABLE_ENTITY", { code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL" }), "auth.emailTaken"],
    ["second guest login", new APIError("BAD_REQUEST", { code: "ANONYMOUS_USERS_CANNOT_SIGN_IN_AGAIN_ANONYMOUSLY" }), "auth.alreadyGuest"],
    ["bad credentials", new APIError("UNAUTHORIZED", { code: "INVALID_EMAIL_OR_PASSWORD" }), "auth.invalidCredentials"],
  ])("translateAuthError names %s", async (_name, error, reason) => {
    expect((await detailOf(() => translateAuthError(error))).reason).toBe(reason);
  });

  it("the in-memory repos raise the same reasons as the database ones", async () => {
    const ctx = createTestContext();
    const k = await seedKanban(ctx);
    const stage = ctx.store.stages.get(k.todoId)!;
    const insertTwice = async () => ctx.repos.stages.insert({ ...stage, id: "00000000-0000-4000-8000-0000000000ff" });
    expect((await detailOf(insertTwice)).reason).toBe("stage.nameTaken");
  });
});
