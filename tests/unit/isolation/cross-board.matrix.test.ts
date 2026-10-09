import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import type { AppDeps } from "@/application/deps";
import { makeCreateBoard } from "@/application/use-cases/boards/create-board";
import { makeDeleteBoard } from "@/application/use-cases/boards/delete-board";
import { makeListMyBoards } from "@/application/use-cases/boards/list-my-boards";
import { makeUpdateBoard } from "@/application/use-cases/boards/update-board";
import { makeAddMember } from "@/application/use-cases/members/add-member";
import { makeChangeMemberRole } from "@/application/use-cases/members/change-member-role";
import { makeListMembers } from "@/application/use-cases/members/list-members";
import { makeListMyMemberships } from "@/application/use-cases/members/list-my-memberships";
import { makeRemoveMember } from "@/application/use-cases/members/remove-member";
import { makeCreatePipeline } from "@/application/use-cases/pipelines/create-pipeline";
import { makeDeletePipeline } from "@/application/use-cases/pipelines/delete-pipeline";
import { makeListPipelines } from "@/application/use-cases/pipelines/list-pipelines";
import { makeUpdatePipeline } from "@/application/use-cases/pipelines/update-pipeline";
import { makeCreateStage } from "@/application/use-cases/stages/create-stage";
import { makeDeleteStage } from "@/application/use-cases/stages/delete-stage";
import { makeListStages } from "@/application/use-cases/stages/list-stages";
import { makeRenameStage } from "@/application/use-cases/stages/rename-stage";
import { makeReorderStage } from "@/application/use-cases/stages/reorder-stage";
import { makeCreateTask } from "@/application/use-cases/tasks/create-task";
import { makeDeleteTask } from "@/application/use-cases/tasks/delete-task";
import { makeGetTask } from "@/application/use-cases/tasks/get-task";
import { makeListTasksByPipeline } from "@/application/use-cases/tasks/list-tasks-by-pipeline";
import { makeMoveTask } from "@/application/use-cases/tasks/move-task";
import { makeReorderTask } from "@/application/use-cases/tasks/reorder-task";
import { makeUpdateTask } from "@/application/use-cases/tasks/update-task";
import type { Actor } from "@/application/actor";
import { can, type BoardAction } from "@/domain/policy/board-policy";
import { ForbiddenError, NotFoundError, ValidationError } from "@/domain/errors";
import { createTestContext, type TestContext } from "@tests/support/app-context";
import { GUEST, MEMBER, OWNER, STRANGER, seedKanban } from "@tests/support/fixtures";

interface Ids {
  boardId: string;
  pipelineId: string;
  stageId: string;
  doneId: string;
  taskId: string;
}
type Run = (deps: AppDeps, actor: Actor, ids: Ids) => Promise<unknown>;

const ghost = (n: number) => `00000000-0000-4000-8000-0000000fff${n.toString(16).padStart(2, "0")}`;
const GHOSTS: Ids = { boardId: ghost(1), pipelineId: ghost(2), stageId: ghost(3), doneId: ghost(4), taskId: ghost(5) };

/**
 * Every use case MUST be registered here (the completeness test below fails otherwise).
 * `action` is the policy action it needs; `null` marks self-scoped use cases that take no
 * resource id and therefore cannot be aimed at someone else's data.
 */
const REGISTRY: Record<string, { action: BoardAction | null; run: Run }> = {
  "boards/create-board.ts": { action: null, run: (d, a) => makeCreateBoard(d)(a, { name: "x" }) },
  "boards/list-my-boards.ts": { action: null, run: (d, a) => makeListMyBoards(d)(a) },
  "boards/update-board.ts": { action: "board:update", run: (d, a, i) => makeUpdateBoard(d)(a, { boardId: i.boardId, name: "x" }) },
  "boards/delete-board.ts": { action: "board:delete", run: (d, a, i) => makeDeleteBoard(d)(a, { boardId: i.boardId }) },
  "members/add-member.ts": { action: "member:manage", run: (d, a, i) => makeAddMember(d)(a, { boardId: i.boardId, userId: "carol", role: "member" }) },
  "members/remove-member.ts": { action: "member:manage", run: (d, a, i) => makeRemoveMember(d)(a, { boardId: i.boardId, userId: "member" }) },
  "members/change-member-role.ts": { action: "member:manage", run: (d, a, i) => makeChangeMemberRole(d)(a, { boardId: i.boardId, userId: "member", role: "guest" }) },
  "members/list-members.ts": { action: "board:view", run: (d, a, i) => makeListMembers(d)(a, { boardId: i.boardId }) },
  "members/list-my-memberships.ts": { action: null, run: (d, a) => makeListMyMemberships(d)(a) },
  "pipelines/create-pipeline.ts": { action: "pipeline:manage", run: (d, a, i) => makeCreatePipeline(d)(a, { boardId: i.boardId, name: "x" }) },
  "pipelines/list-pipelines.ts": { action: "board:view", run: (d, a, i) => makeListPipelines(d)(a, { boardId: i.boardId }) },
  "pipelines/update-pipeline.ts": { action: "pipeline:manage", run: (d, a, i) => makeUpdatePipeline(d)(a, { pipelineId: i.pipelineId, name: "x" }) },
  "pipelines/delete-pipeline.ts": { action: "pipeline:manage", run: (d, a, i) => makeDeletePipeline(d)(a, { pipelineId: i.pipelineId }) },
  "stages/create-stage.ts": { action: "pipeline:manage", run: (d, a, i) => makeCreateStage(d)(a, { pipelineId: i.pipelineId, name: "x" }) },
  "stages/list-stages.ts": { action: "board:view", run: (d, a, i) => makeListStages(d)(a, { pipelineId: i.pipelineId }) },
  "stages/rename-stage.ts": { action: "pipeline:manage", run: (d, a, i) => makeRenameStage(d)(a, { stageId: i.stageId, name: "x" }) },
  "stages/reorder-stage.ts": { action: "pipeline:manage", run: (d, a, i) => makeReorderStage(d)(a, { stageId: i.stageId, afterStageId: null }) },
  "stages/delete-stage.ts": { action: "pipeline:manage", run: (d, a, i) => makeDeleteStage(d)(a, { stageId: i.stageId, moveToStageId: i.doneId }) },
  "tasks/create-task.ts": { action: "task:write", run: (d, a, i) => makeCreateTask(d)(a, { stageId: i.stageId, title: "x" }) },
  "tasks/get-task.ts": { action: "board:view", run: (d, a, i) => makeGetTask(d)(a, { taskId: i.taskId }) },
  "tasks/update-task.ts": { action: "task:write", run: (d, a, i) => makeUpdateTask(d)(a, { taskId: i.taskId, title: "x" }) },
  "tasks/delete-task.ts": { action: "task:write", run: (d, a, i) => makeDeleteTask(d)(a, { taskId: i.taskId }) },
  "tasks/list-tasks-by-pipeline.ts": { action: "board:view", run: (d, a, i) => makeListTasksByPipeline(d)(a, { pipelineId: i.pipelineId }) },
  "tasks/move-task.ts": { action: "task:write", run: (d, a, i) => makeMoveTask(d)(a, { taskId: i.taskId, toStageId: i.doneId, afterTaskId: null }) },
  "tasks/reorder-task.ts": { action: "task:write", run: (d, a, i) => makeReorderTask(d)(a, { taskId: i.taskId, afterTaskId: null }) },
};

const snapshot = (ctx: TestContext) => JSON.stringify(Object.values(ctx.store).map((table) => [...table]));
const failure = (promise: Promise<unknown>) => promise.then(() => null, (error: unknown) => error);
const RESOURCE_CASES = Object.entries(REGISTRY).filter(([, c]) => c.action !== null) as [string, { action: BoardAction; run: Run }][];

describe("cross-board isolation matrix (REQ-ISO-01)", () => {
  let ctx: TestContext;
  let ids: Ids;
  beforeEach(async () => {
    ctx = createTestContext();
    const k = await seedKanban(ctx);
    const task = await makeCreateTask(ctx)(OWNER, { stageId: k.todoId, title: "secret" });
    ids = { boardId: k.boardId, pipelineId: k.pipelineId, stageId: k.todoId, doneId: k.doneId, taskId: task.id };
  });

  it("registers every use case on disk, and nothing stale", () => {
    const root = fileURLToPath(new URL("../../../src/application/use-cases/", import.meta.url));
    const onDisk = (readdirSync(root, { recursive: true }) as string[])
      .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts") && !file.split("/").pop()!.startsWith("_"))
      .sort();
    expect(Object.keys(REGISTRY).sort()).toEqual(onDisk);
  });

  describe.each(RESOURCE_CASES)("%s", (_file, { action, run }) => {
    it("answers NotFound to a non-member and changes nothing", async () => {
      const before = snapshot(ctx);
      expect(await failure(run(ctx, STRANGER, ids))).toBeInstanceOf(NotFoundError);
      expect(snapshot(ctx)).toBe(before);
    });

    it("answers a stranger exactly the same for foreign and non-existent ids (REQ-ISO-08)", async () => {
      const foreign = await failure(run(ctx, STRANGER, ids));
      const missing = await failure(run(ctx, STRANGER, GHOSTS));
      expect(missing).toBeInstanceOf(NotFoundError);
      expect(missing).toEqual(foreign);
    });

    it.each([MEMBER, GUEST].filter((who) => !can(who.userId as "member" | "guest", action)))(
      "answers Forbidden to $userId and changes nothing",
      async (who) => {
        const before = snapshot(ctx);
        expect(await failure(run(ctx, who, ids))).toBeInstanceOf(ForbiddenError);
        expect(snapshot(ctx)).toBe(before);
      },
    );
  });

  describe("self-scoped use cases never expose another user's data", () => {
    it("lists nothing for a user without boards or memberships (REQ-ISO-05)", async () => {
      expect(await REGISTRY["boards/list-my-boards.ts"]!.run(ctx, STRANGER, ids)).toEqual([]);
      expect(await REGISTRY["members/list-my-memberships.ts"]!.run(ctx, STRANGER, ids)).toEqual([]);
      expect(makeListMyMemberships(ctx).length).toBe(1);
    });
  });
});

describe("v1 IDOR regressions", () => {
  let ctx: TestContext;
  let k: Awaited<ReturnType<typeof seedKanban>>;
  beforeEach(async () => {
    ctx = createTestContext();
    k = await seedKanban(ctx);
  });

  it("REQ-ISO-02: B cannot read A's task by id", async () => {
    const task = await makeCreateTask(ctx)(OWNER, { stageId: k.todoId, title: "A's" });
    await expect(makeGetTask(ctx)(STRANGER, { taskId: task.id })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("REQ-ISO-03/04: B cannot list A's pipeline tasks or board members", async () => {
    await expect(makeListTasksByPipeline(ctx)(STRANGER, { pipelineId: k.pipelineId })).rejects.toBeInstanceOf(NotFoundError);
    await expect(makeListMembers(ctx)(STRANGER, { boardId: k.boardId })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("REQ-ISO-07: moving a task into another board's stage is NotFound; a non-member assignee is 422", async () => {
    const task = await makeCreateTask(ctx)(OWNER, { stageId: k.todoId, title: "mine" });
    const other = await makeCreateBoard(ctx)(STRANGER, { name: "B's" });
    const pipeline = await makeCreatePipeline(ctx)(STRANGER, { boardId: other.id, name: "P" });
    const foreign = await makeCreateStage(ctx)(STRANGER, { pipelineId: pipeline.id, name: "S" });
    await expect(makeMoveTask(ctx)(OWNER, { taskId: task.id, toStageId: foreign.id, afterTaskId: null })).rejects.toBeInstanceOf(NotFoundError);
    await expect(makeCreateTask(ctx)(OWNER, { stageId: k.todoId, title: "x", assigneeId: "stranger" })).rejects.toBeInstanceOf(ValidationError);
  });
});
