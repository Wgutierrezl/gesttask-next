import { beforeEach, describe, expect, it } from "vitest";
import { ForbiddenError, NotFoundError, ValidationError } from "@/domain/errors";
import { createTestContext, type TestContext } from "@tests/support/app-context";
import { GUEST, MEMBER, OWNER, STRANGER, seedBoard } from "@tests/support/fixtures";
import { makeCreatePipeline } from "./create-pipeline";
import { makeDeletePipeline } from "./delete-pipeline";
import { makeListPipelines } from "./list-pipelines";
import { makeUpdatePipeline } from "./update-pipeline";

describe("pipelines", () => {
  let ctx: TestContext;
  let boardId: string;
  beforeEach(async () => {
    ctx = createTestContext();
    ({ boardId } = await seedBoard(ctx));
  });

  it("lets the owner create, list, update and delete a pipeline", async () => {
    const created = await makeCreatePipeline(ctx)(OWNER, { boardId, name: " Sprint " });
    expect(created).toMatchObject({ boardId, name: "Sprint", description: "" });
    expect(await makeListPipelines(ctx)(OWNER, { boardId })).toEqual([created]);

    const updated = await makeUpdatePipeline(ctx)(OWNER, { pipelineId: created.id, description: "Q4" });
    expect(updated).toEqual({ ...created, description: "Q4" });

    await makeDeletePipeline(ctx)(OWNER, { pipelineId: created.id });
    expect(await makeListPipelines(ctx)(OWNER, { boardId })).toEqual([]);
  });

  it("creates the default stages with only the last one flagged done (REQ-TSK-05)", async () => {
    const created = await makeCreatePipeline(ctx)(OWNER, { boardId, name: "P" });
    const stages = await ctx.repos.stages.listByPipeline(created.id);
    expect(stages.map((s) => [s.name, s.isDone])).toEqual([
      ["To do", false],
      ["In progress", false],
      ["Done", true],
    ]);
    expect(stages.every((s) => s.boardId === boardId && s.pipelineId === created.id)).toBe(true);
  });

  it("creates the pipeline and its stages atomically", async () => {
    const base = ctx.uow;
    let inserts = 0;
    const flaky = {
      run: <T>(fn: Parameters<typeof base.run<T>>[0]) =>
        base.run((tx) =>
          fn({
            ...tx,
            stages: {
              ...tx.stages,
              insert: async (stage) => {
                if (++inserts === 2) throw new Error("boom");
                await tx.stages.insert(stage);
              },
            },
          }),
        ),
    };
    await expect(makeCreatePipeline({ ...ctx, uow: flaky })(OWNER, { boardId, name: "P" })).rejects.toThrow("boom");
    expect(ctx.store.pipelines.size).toBe(0);
    expect(ctx.store.stages.size).toBe(0);
  });

  it("validates names", async () => {
    await expect(makeCreatePipeline(ctx)(OWNER, { boardId, name: "" })).rejects.toBeInstanceOf(ValidationError);
    expect(ctx.store.pipelines.size).toBe(0);
  });

  it("lets every member role list pipelines", async () => {
    await makeCreatePipeline(ctx)(OWNER, { boardId, name: "P" });
    for (const who of [MEMBER, GUEST]) expect(await makeListPipelines(ctx)(who, { boardId })).toHaveLength(1);
  });

  it.each([
    ["member", MEMBER, ForbiddenError],
    ["guest", GUEST, ForbiddenError],
    ["stranger", STRANGER, NotFoundError],
  ] as const)("denies %s any mutation without side effects", async (_l, who, error) => {
    const { id } = await makeCreatePipeline(ctx)(OWNER, { boardId, name: "P" });
    await expect(makeCreatePipeline(ctx)(who, { boardId, name: "X" })).rejects.toBeInstanceOf(error);
    await expect(makeUpdatePipeline(ctx)(who, { pipelineId: id, name: "X" })).rejects.toBeInstanceOf(error);
    await expect(makeDeletePipeline(ctx)(who, { pipelineId: id })).rejects.toBeInstanceOf(error);
    expect([...ctx.store.pipelines.values()].map((p) => p.name)).toEqual(["P"]);
  });

  it("hides pipelines from strangers and makes missing ids indistinguishable (REQ-ISO-08)", async () => {
    const { id } = await makeCreatePipeline(ctx)(OWNER, { boardId, name: "P" });
    await expect(makeListPipelines(ctx)(STRANGER, { boardId })).rejects.toBeInstanceOf(NotFoundError);
    const missing = "00000000-0000-4000-8000-0000000000ff";
    const foreign = await makeDeletePipeline(ctx)(STRANGER, { pipelineId: id }).catch((e) => e);
    const absent = await makeDeletePipeline(ctx)(STRANGER, { pipelineId: missing }).catch((e) => e);
    expect(absent).toEqual(foreign);
  });

  it("cascades a pipeline delete to its stages and tasks", async () => {
    const { id } = await makeCreatePipeline(ctx)(OWNER, { boardId, name: "P" });
    await ctx.repos.stages.insert({ id: "s1", pipelineId: id, boardId, name: "Todo", isDone: false, position: "a0" });
    await makeDeletePipeline(ctx)(OWNER, { pipelineId: id });
    expect(ctx.store.stages.size).toBe(0);
  });
});
