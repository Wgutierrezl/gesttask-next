import { beforeEach, describe, expect, it } from "vitest";
import { NotFoundError, ValidationError } from "@/domain/errors";
import { createTestContext, type TestContext } from "@tests/support/app-context";
import { MEMBER, OWNER, STRANGER, buildTask, clearStages, seedBoard, seedKanban } from "@tests/support/fixtures";
import { makeCreateBoard } from "./boards/create-board";
import { makeListMyBoards } from "./boards/list-my-boards";
import { makeAddMember } from "./members/add-member";
import { makeListMembers } from "./members/list-members";
import { makeCreatePipeline } from "./pipelines/create-pipeline";
import { makeListPipelines } from "./pipelines/list-pipelines";
import { makeCreateStage } from "./stages/create-stage";
import { makeListStages } from "./stages/list-stages";
import { makeListTasksByPipeline } from "./tasks/list-tasks-by-pipeline";

const names = (items: { name: string }[]) => items.map((i) => i.name);

describe("paginated lists (default 50, max 200)", () => {
  let ctx: TestContext;
  beforeEach(() => void (ctx = createTestContext()));

  it("listMyBoards pages in a stable order and defaults to 50", async () => {
    for (let i = 0; i < 55; i++) await ctx.repos.boards.insert({ id: `b${String(i).padStart(2, "0")}`, name: `B${i}`, description: "", status: "active", createdAt: new Date(2026, 0, 1), });
    for (let i = 0; i < 55; i++) await ctx.repos.members.insert({ boardId: `b${String(i).padStart(2, "0")}`, userId: "owner", role: "owner" });
    expect(await makeListMyBoards(ctx)(OWNER)).toHaveLength(50);
    expect(names(await makeListMyBoards(ctx)(OWNER, { limit: 3, offset: 2 }))).toEqual(["B2", "B3", "B4"]);
    expect(await makeListMyBoards(ctx)(OWNER, { offset: 54 })).toHaveLength(1);
    expect(await makeListMyBoards(ctx)(OWNER, { offset: 55 })).toEqual([]);
  });

  it("listMyBoards orders by creation time before id", async () => {
    // "early" gets the smaller id but the LATER creation time: only a createdAt-first order yields late, early.
    const early = await makeCreateBoard(ctx)(OWNER, { name: "early" });
    const late = await makeCreateBoard(ctx)(OWNER, { name: "late" });
    expect(early.id < late.id).toBe(true);
    await ctx.repos.boards.update({ ...early, createdAt: new Date("2027-06-01T00:00:00Z") });
    await ctx.repos.boards.update({ ...late, createdAt: new Date("2027-01-01T00:00:00Z") });
    expect(names(await makeListMyBoards(ctx)(OWNER))).toEqual(["late", "early"]);
  });

  it("listMembers pages by user id", async () => {
    const { boardId } = await seedBoard(ctx);
    for (const userId of ["carol", "dave", "erin"]) await makeAddMember(ctx)(OWNER, { boardId, userId, role: "member" });
    const page = (input: object) => makeListMembers(ctx)(OWNER, { boardId, ...input });
    expect((await page({})).map((m) => m.userId)).toEqual(["carol", "dave", "erin", "guest", "member", "owner"]);
    expect((await page({ limit: 2, offset: 1 })).map((m) => m.userId)).toEqual(["dave", "erin"]);
  });

  it("listPipelines and listStages page by name/position", async () => {
    const { boardId } = await seedBoard(ctx);
    const pipelines = [];
    for (const name of ["C", "A", "B"]) pipelines.push(await makeCreatePipeline(ctx)(OWNER, { boardId, name }));
    expect(names(await makeListPipelines(ctx)(OWNER, { boardId }))).toEqual(["A", "B", "C"]);
    expect(names(await makeListPipelines(ctx)(OWNER, { boardId, limit: 1, offset: 1 }))).toEqual(["B"]);
    const pipelineId = pipelines[0]!.id;
    clearStages(ctx, pipelineId);
    for (const name of ["x", "y", "z"]) await makeCreateStage(ctx)(OWNER, { pipelineId, name });
    expect(names(await makeListStages(ctx)(OWNER, { pipelineId }))).toEqual(["x", "y", "z"]);
    expect(names(await makeListStages(ctx)(OWNER, { pipelineId, limit: 2, offset: 1 }))).toEqual(["y", "z"]);
  });

  it.each([{ limit: 0 }, { limit: 202 }, { limit: "abc" }, { offset: -1 }, { limit: 1.5 }])(
    "rejects invalid page %o on every list",
    async (page) => {
      const k = await seedKanban(ctx);
      const calls = [
        makeListMyBoards(ctx)(OWNER, page),
        makeListMembers(ctx)(OWNER, { boardId: k.boardId, ...page }),
        makeListPipelines(ctx)(OWNER, { boardId: k.boardId, ...page }),
        makeListStages(ctx)(OWNER, { pipelineId: k.pipelineId, ...page }),
        makeListTasksByPipeline(ctx)(OWNER, { pipelineId: k.pipelineId, ...page }),
      ];
      for (const call of calls) await expect(call).rejects.toBeInstanceOf(ValidationError);
    },
  );

  it("accepts the maximum page size and keeps authorization first", async () => {
    const k = await seedKanban(ctx);
    expect(await makeListMembers(ctx)(OWNER, { boardId: k.boardId, limit: 200 })).toHaveLength(3);
    await expect(makeListMembers(ctx)(STRANGER, { boardId: k.boardId, limit: 1 })).rejects.toBeInstanceOf(NotFoundError);
    await expect(makeListStages(ctx)(MEMBER, { pipelineId: k.pipelineId, limit: 1 })).resolves.toHaveLength(1);
  });
});

describe("listTasksByPipeline ordering", () => {
  it("orders by stage position, then task position, so pages never interleave columns", async () => {
    const ctx = createTestContext();
    const k = await seedKanban(ctx);
    const put = (id: string, stageId: string, position: string) =>
      ctx.repos.tasks.insert(buildTask({ id, stageId, pipelineId: k.pipelineId, boardId: k.boardId, position }));
    await put("d2", k.doneId, "a1");
    await put("t1", k.todoId, "a1");
    await put("d1", k.doneId, "a0");
    await put("t0", k.todoId, "a0");
    await put("t2", k.todoId, "a2");
    const ids: string[] = [];
    for (let offset = 0; offset < 5; offset += 2) {
      const page = await makeListTasksByPipeline(ctx)(OWNER, { pipelineId: k.pipelineId, limit: 2, offset });
      ids.push(...page.map((t) => t.id));
    }
    expect(ids).toEqual(["t0", "t1", "t2", "d1", "d2"]);
  });
});
