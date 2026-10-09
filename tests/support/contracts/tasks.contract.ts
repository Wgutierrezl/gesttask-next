import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { at, makePipeline, makeStage, makeTask, seedStage, uuid, type RepoHarness } from "./harness";

/** Behaviour every TaskRepo implementation must share, including FK cascades and ordering. */
export function runTaskContract(name: string, setup: () => RepoHarness): void {
  describe(`task repository (${name})`, () => {
    const h = setup();
    beforeEach(() => h.reset());
    afterAll(() => h.close?.());

    it("round-trips every field and returns null for an unknown id", async () => {
      const { stage } = await seedStage(h);
      const task = makeTask(stage, {
        title: "Ship", description: "now", priority: "high", status: "inactive", dueDate: "2026-12-31",
        assigneeId: "u1", completedAt: at(30), position: "a5", createdAt: at(10),
      });
      await h.repos.tasks.insert(task);
      expect(await h.repos.tasks.findById(task.id)).toEqual(task);
      expect(await h.repos.tasks.findById(uuid())).toBeNull();
    });

    it("updates fields, including clearing nullable ones, and deletes", async () => {
      const { stage } = await seedStage(h);
      const task = makeTask(stage, { dueDate: "2026-01-01", assigneeId: "u1", completedAt: at(1) });
      await h.repos.tasks.insert(task);
      const changed = { ...task, title: "Renamed", priority: "low" as const, dueDate: null, assigneeId: null, completedAt: null, position: "a9" };
      await h.repos.tasks.update(changed);
      expect(await h.repos.tasks.findById(task.id)).toEqual(changed);
      await h.repos.tasks.delete(task.id);
      expect(await h.repos.tasks.findById(task.id)).toBeNull();
    });

    it("lists a stage's tasks bytewise by position, then id", async () => {
      const { stage, pipeline } = await seedStage(h);
      const other = makeStage(pipeline, { position: "b" });
      await h.repos.stages.insert(other);
      const tasks = [
        makeTask(stage, { position: "b" }), makeTask(stage, { position: "B" }), makeTask(stage, { position: "a" }),
        makeTask(stage, { position: "a" }), makeTask(other, { position: "0" }),
      ];
      for (const t of tasks) await h.repos.tasks.insert(t);
      const [lower, upper, a1, a2] = tasks as [typeof tasks[0], typeof tasks[0], typeof tasks[0], typeof tasks[0]];
      const ties = [a1.id, a2.id].sort();
      expect((await h.repos.tasks.listByStage(stage.id)).map((t) => t.id)).toEqual([upper.id, ...ties, lower.id]);
    });

    it("lists a pipeline's tasks column by column (stage position, stage id, task position, task id) with pagination", async () => {
      const { stage: first, pipeline } = await seedStage(h, { position: "m" });
      const second = makeStage(pipeline, { position: "c" });
      await h.repos.stages.insert(second);
      const a = makeTask(first, { position: "b" });
      const b = makeTask(first, { position: "a" });
      const c = makeTask(second, { position: "z" });
      const d = makeTask(second, { position: "y" });
      for (const t of [a, b, c, d]) await h.repos.tasks.insert(t);
      const ids = async (page: { limit: number; offset: number }) =>
        (await h.repos.tasks.listByPipeline(pipeline.id, page)).map((t) => t.id);
      expect(await ids({ limit: 10, offset: 0 })).toEqual([d.id, c.id, b.id, a.id]);
      expect(await ids({ limit: 2, offset: 1 })).toEqual([c.id, b.id]);
    });

    it("breaks equal stage positions by stage id so columns never interleave", async () => {
      const { stage: one, pipeline } = await seedStage(h, { position: "a" });
      const two = makeStage(pipeline, { position: "a" });
      await h.repos.stages.insert(two);
      const tasks = [makeTask(one, { position: "a" }), makeTask(one, { position: "b" }), makeTask(two, { position: "a" }), makeTask(two, { position: "b" })];
      for (const t of tasks) await h.repos.tasks.insert(t);
      const firstStageId = [one.id, two.id].sort()[0]!;
      const listed = await h.repos.tasks.listByPipeline(pipeline.id, { limit: 10, offset: 0 });
      expect(listed.map((t) => t.stageId)).toEqual([firstStageId, firstStageId, ...[one.id, two.id].filter((s) => s !== firstStageId).flatMap((s) => [s, s])]);
    });

    it("clearAssignee unassigns the user on one board's tasks only", async () => {
      const { stage } = await seedStage(h);
      const other = await seedStage(h);
      const mine = makeTask(stage, { assigneeId: "u1" });
      const theirs = makeTask(stage, { assigneeId: "u2" });
      const elsewhere = makeTask(other.stage, { assigneeId: "u1" });
      for (const t of [mine, theirs, elsewhere]) await h.repos.tasks.insert(t);
      await h.repos.tasks.clearAssignee(stage.boardId, "u1");
      expect((await h.repos.tasks.findById(mine.id))?.assigneeId).toBeNull();
      expect((await h.repos.tasks.findById(theirs.id))?.assigneeId).toBe("u2");
      expect((await h.repos.tasks.findById(elsewhere.id))?.assigneeId).toBe("u1");
    });

    describe("cascades", () => {
      const seedTasks = async () => {
        const ctx = await seedStage(h);
        const tasks = [makeTask(ctx.stage), makeTask(ctx.stage)];
        for (const t of tasks) await h.repos.tasks.insert(t);
        return { ...ctx, tasks };
      };
      const remaining = async (ids: string[]) => (await Promise.all(ids.map((id) => h.repos.tasks.findById(id)))).filter(Boolean);

      it("deleting a stage deletes its tasks", async () => {
        const { stage, tasks } = await seedTasks();
        await h.repos.stages.delete(stage.id);
        expect(await remaining(tasks.map((t) => t.id))).toEqual([]);
      });

      it("deleting a pipeline deletes its stages and tasks", async () => {
        const { pipeline, tasks } = await seedTasks();
        await h.repos.pipelines.delete(pipeline.id);
        expect(await remaining(tasks.map((t) => t.id))).toEqual([]);
      });

      it("deleting a board deletes everything below it in one go", async () => {
        const { board, tasks } = await seedTasks();
        await h.repos.boards.delete(board.id);
        expect(await remaining(tasks.map((t) => t.id))).toEqual([]);
      });

      it("a failure after a cascading delete rolls the whole tree back (REQ-CAS-01)", async () => {
        const { board, pipeline, stage, tasks } = await seedTasks();
        const boom = new Error("boom");
        await expect(
          h.uow.run(async (tx) => {
            await tx.boards.delete(board.id);
            throw boom;
          }),
        ).rejects.toBe(boom);
        expect(await h.repos.boards.findById(board.id)).toEqual(board);
        expect(await h.repos.pipelines.findById(pipeline.id)).toEqual(pipeline);
        expect(await h.repos.stages.findById(stage.id)).toEqual(stage);
        expect((await remaining(tasks.map((t) => t.id))).length).toBe(2);
      });
    });

    it("reads inside a transaction return the same data as plain reads", async () => {
      const { stage, pipeline } = await seedStage(h);
      for (const position of ["b", "a"]) await h.repos.tasks.insert(makeTask(stage, { position }));
      const plain = await h.repos.tasks.listByStage(stage.id);
      await h.uow.run(async (tx) => {
        expect(await tx.tasks.listByStage(stage.id)).toEqual(plain);
        expect(await tx.tasks.findById(plain[0]!.id)).toEqual(plain[0]);
        expect(await tx.tasks.listByPipeline(pipeline.id, { limit: 5, offset: 0 })).toEqual(plain);
      });
    });

    it("keeps unrelated pipelines apart", async () => {
      const { board, stage } = await seedStage(h);
      const otherPipeline = makePipeline(board.id);
      await h.repos.pipelines.insert(otherPipeline);
      const otherStage = makeStage(otherPipeline);
      await h.repos.stages.insert(otherStage);
      const mine = makeTask(stage);
      await h.repos.tasks.insert(mine);
      await h.repos.tasks.insert(makeTask(otherStage));
      expect((await h.repos.tasks.listByPipeline(stage.pipelineId, { limit: 9, offset: 0 })).map((t) => t.id)).toEqual([mine.id]);
    });
  });
}
