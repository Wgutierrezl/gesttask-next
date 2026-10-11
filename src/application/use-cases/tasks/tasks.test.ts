import { beforeEach, describe, expect, it } from "vitest";
import { ForbiddenError, NotFoundError, ValidationError } from "@/domain/errors";
import { createTestContext, type TestContext } from "@tests/support/app-context";
import { recordTxCalls } from "@tests/support/race";
import { GUEST, MEMBER, OWNER, STRANGER, seedKanban } from "@tests/support/fixtures";
import { makeCreateTask } from "./create-task";
import { makeDeleteTask } from "./delete-task";
import { makeGetTask } from "./get-task";
import { makeListTasksByPipeline } from "./list-tasks-by-pipeline";
import { makeUpdateTask } from "./update-task";

describe("tasks CRUD", () => {
  let ctx: TestContext;
  let k: Awaited<ReturnType<typeof seedKanban>>;
  const create = (input: object = {}) => makeCreateTask(ctx)(OWNER, { stageId: k.todoId, title: "Write spec", ...input });

  beforeEach(async () => {
    ctx = createTestContext();
    k = await seedKanban(ctx);
  });

  describe("createTask", () => {
    it("creates a task with defaults, deriving board and pipeline from the stage", async () => {
      const task = await create();
      expect(task).toMatchObject({
        boardId: k.boardId,
        pipelineId: k.pipelineId,
        stageId: k.todoId,
        description: "",
        priority: "medium",
        status: "active",
        dueDate: null,
        assigneeId: null,
        completedAt: null,
        overdue: false,
      });
    });

    it("appends tasks at the end of the stage", async () => {
      const [a, b, c] = [await create({ title: "a" }), await create({ title: "b" }), await create({ title: "c" })];
      expect((await ctx.repos.tasks.listByStage(k.todoId)).map((t) => t.id)).toEqual([a.id, b.id, c.id]);
    });

    it("completes the task when it is created in the final stage", async () => {
      expect((await create({ stageId: k.doneId })).completedAt).toEqual(ctx.clock.now());
    });

    it.each([
      [{ title: "" }],
      [{ title: "x".repeat(121) }],
      [{ description: "d".repeat(5001) }],
      [{ priority: "alta" }],
      [{ dueDate: "next friday" }],
    ])("rejects invalid input %o (REQ-TSK-01)", async (input) => {
      await expect(create(input)).rejects.toBeInstanceOf(ValidationError);
      expect(ctx.store.tasks.size).toBe(0);
    });

    it("accepts a past due date and flags it overdue instead of failing (REQ-TSK-05)", async () => {
      expect((await create({ dueDate: "2020-01-01" })).overdue).toBe(true);
    });

    it("requires the assignee to be a member of the same board with 422 (REQ-TSK-02)", async () => {
      expect((await create({ assigneeId: MEMBER.userId })).assigneeId).toBe("member");
      const error = await create({ assigneeId: "outsider" }).catch((e) => e);
      expect(error).toBeInstanceOf(ValidationError);
      expect(Object.keys(error.fieldErrors)).toEqual(["assigneeId"]);
      expect(ctx.store.tasks.size).toBe(1);
    });
  });

  describe("permissions", () => {
    it.each([
      ["guest", GUEST, ForbiddenError],
      ["stranger", STRANGER, NotFoundError],
    ] as const)("denies %s any write and leaves state intact", async (_l, who, error) => {
      const task = await create();
      await expect(makeCreateTask(ctx)(who, { stageId: k.todoId, title: "x" })).rejects.toBeInstanceOf(error);
      await expect(makeUpdateTask(ctx)(who, { taskId: task.id, title: "x" })).rejects.toBeInstanceOf(error);
      await expect(makeDeleteTask(ctx)(who, { taskId: task.id })).rejects.toBeInstanceOf(error);
      expect([...ctx.store.tasks.values()].map((t) => t.title)).toEqual(["Write spec"]);
    });

    it("lets members write and every role read", async () => {
      const task = await makeCreateTask(ctx)(MEMBER, { stageId: k.todoId, title: "by member" });
      for (const who of [OWNER, MEMBER, GUEST]) expect((await makeGetTask(ctx)(who, { taskId: task.id })).id).toBe(task.id);
      // The ids come back so callers can navigate somewhere without trusting the client.
      expect(await makeDeleteTask(ctx)(MEMBER, { taskId: task.id })).toEqual({ boardId: k.boardId, pipelineId: k.pipelineId });
      expect(ctx.store.tasks.size).toBe(0);
    });

    it("hides tasks from strangers exactly like missing ones (REQ-ISO-02, REQ-ISO-08)", async () => {
      const task = await create();
      const missing = "00000000-0000-4000-8000-0000000000ff";
      const foreign = await makeGetTask(ctx)(STRANGER, { taskId: task.id }).catch((e) => e);
      const absent = await makeGetTask(ctx)(STRANGER, { taskId: missing }).catch((e) => e);
      expect(foreign).toBeInstanceOf(NotFoundError);
      expect(absent).toEqual(foreign);
      await expect(makeListTasksByPipeline(ctx)(STRANGER, { pipelineId: k.pipelineId })).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });
  });

  describe("updateTask", () => {
    it("changes only the given fields and can clear nullable ones", async () => {
      const task = await create({ dueDate: "2026-12-01", assigneeId: MEMBER.userId });
      const updated = await makeUpdateTask(ctx)(OWNER, {
        taskId: task.id,
        title: "Renamed",
        priority: "high",
        status: "inactive",
        dueDate: null,
        assigneeId: null,
      });
      expect(updated).toMatchObject({ title: "Renamed", priority: "high", status: "inactive", dueDate: null, assigneeId: null });
      const partial = await makeUpdateTask(ctx)(OWNER, { taskId: task.id, description: "More" });
      expect(partial).toMatchObject({ title: "Renamed", description: "More", priority: "high" });
    });

    it("re-checks the assignee and rejects non-members", async () => {
      const task = await create();
      await expect(makeUpdateTask(ctx)(OWNER, { taskId: task.id, assigneeId: "outsider" })).rejects.toBeInstanceOf(
        ValidationError,
      );
      const ok = await makeUpdateTask(ctx)(OWNER, { taskId: task.id, assigneeId: MEMBER.userId });
      expect(ok.assigneeId).toBe("member");
    });

    it("rejects the v1 priority typo", async () => {
      const task = await create();
      await expect(makeUpdateTask(ctx)(OWNER, { taskId: task.id, priority: "alta" })).rejects.toBeInstanceOf(
        ValidationError,
      );
    });
  });

  describe("listTasksByPipeline (REQ-TSK-07)", () => {
    it("returns an empty list when there are no tasks", async () => {
      expect(await makeListTasksByPipeline(ctx)(OWNER, { pipelineId: k.pipelineId })).toEqual([]);
    });

    it("paginates with a default of 50 and a maximum of 200", async () => {
      for (let i = 0; i < 3; i++) await create({ title: `t${i}` });
      const all = await makeListTasksByPipeline(ctx)(GUEST, { pipelineId: k.pipelineId });
      expect(all.map((t) => t.title)).toEqual(["t0", "t1", "t2"]);
      const page = await makeListTasksByPipeline(ctx)(OWNER, { pipelineId: k.pipelineId, limit: 1, offset: 1 });
      expect(page.map((t) => t.title)).toEqual(["t1"]);
      await expect(makeListTasksByPipeline(ctx)(OWNER, { pipelineId: k.pipelineId, limit: 202 })).rejects.toBeInstanceOf(
        ValidationError,
      );
    });
  });

  describe("lock order (members, pipelines, stages, tasks)", () => {
    const before = (calls: string[], first: string, second: string) => {
      expect(calls).toContain(first);
      expect(calls.indexOf(first)).toBeLessThan(calls.indexOf(second));
    };

    it("createTask locks the pipeline's stage list before the stage's tasks, never a lone stage", async () => {
      const spy = recordTxCalls(ctx);
      await makeCreateTask(spy.ctx)(OWNER, { stageId: k.todoId, title: "ordered" });
      before(spy.calls, "stages.listByPipeline", "tasks.listByStage");
      expect(spy.calls).not.toContain("stages.findById");
    });

    it("createTask checks the assignee's membership before the pipeline", async () => {
      const spy = recordTxCalls(ctx);
      await makeCreateTask(spy.ctx)(OWNER, { stageId: k.todoId, title: "assigned", assigneeId: MEMBER.userId });
      before(spy.calls, "members.find", "stages.listByPipeline");
    });

    it("updateTask checks the assignee's membership before it locks the task", async () => {
      const task = await create();
      const spy = recordTxCalls(ctx);
      await makeUpdateTask(spy.ctx)(OWNER, { taskId: task.id, assigneeId: MEMBER.userId });
      before(spy.calls, "members.find", "tasks.findById");
    });

    it("createTask answers NotFound when the stage vanished before the transaction", async () => {
      const racing = { ...ctx, uow: { run: <T,>(work: Parameters<typeof ctx.uow.run<T>>[0]) => { ctx.store.stages.delete(k.todoId); return ctx.uow.run(work); } } };
      await expect(makeCreateTask(racing)(OWNER, { stageId: k.todoId, title: "late" })).rejects.toBeInstanceOf(NotFoundError);
    });
  });
});
