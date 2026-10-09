import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ConflictError, NotFoundError } from "@/domain/errors";
import { makeBoard, makePipeline, makeStage, seedPipeline, uuid, type RepoHarness } from "./harness";

/** Behaviour every PipelineRepo/StageRepo implementation must share. */
export function runPipelineContract(name: string, setup: () => RepoHarness): void {
  describe(`pipeline and stage repositories (${name})`, () => {
    const h = setup();
    beforeEach(() => h.reset());
    afterAll(() => h.close?.());

    describe("referential integrity", () => {
      it("rejects a child whose parent does not exist with NotFoundError", async () => {
        const { board, pipeline } = await seedPipeline(h);
        await expect(h.repos.pipelines.insert(makePipeline(uuid()))).rejects.toBeInstanceOf(NotFoundError);
        await expect(h.repos.members.insert({ boardId: uuid(), userId: "u1", role: "owner" })).rejects.toBeInstanceOf(NotFoundError);
        await expect(h.repos.stages.insert(makeStage({ ...pipeline, id: uuid() }))).rejects.toBeInstanceOf(NotFoundError);
        expect(await h.repos.pipelines.listByBoard(board.id, { limit: 10, offset: 0 })).toEqual([pipeline]);
      });

      it("rejects a stage whose boardId differs from its pipeline's board (insert and update)", async () => {
        const { pipeline } = await seedPipeline(h);
        const stranger = makeBoard();
        await h.repos.boards.insert(stranger);
        await expect(h.repos.stages.insert(makeStage(pipeline, { boardId: stranger.id }))).rejects.toBeInstanceOf(NotFoundError);
        const stage = makeStage(pipeline);
        await h.repos.stages.insert(stage);
        await expect(h.repos.stages.update({ ...stage, boardId: stranger.id })).rejects.toBeInstanceOf(NotFoundError);
        expect(await h.repos.stages.findById(stage.id)).toEqual(stage);
      });
    });

    describe("pipelines", () => {
      it("round-trips, updates and returns null for an unknown id", async () => {
        const { pipeline } = await seedPipeline(h);
        expect(await h.repos.pipelines.findById(pipeline.id)).toEqual(pipeline);
        expect(await h.repos.pipelines.findById(uuid())).toBeNull();
        await h.repos.pipelines.update({ ...pipeline, name: "Sprint", description: "d" });
        expect(await h.repos.pipelines.findById(pipeline.id)).toEqual({ ...pipeline, name: "Sprint", description: "d" });
      });

      it("lists one board's pipelines bytewise by name then id, with pagination", async () => {
        const board = makeBoard();
        const other = makeBoard();
        await h.repos.boards.insert(board);
        await h.repos.boards.insert(other);
        for (const n of ["b", "a", "B"]) await h.repos.pipelines.insert(makePipeline(board.id, { name: n }));
        await h.repos.pipelines.insert(makePipeline(other.id, { name: "elsewhere" }));
        const names = async (page: { limit: number; offset: number }) =>
          (await h.repos.pipelines.listByBoard(board.id, page)).map((p) => p.name);
        expect(await names({ limit: 10, offset: 0 })).toEqual(["B", "a", "b"]);
        expect(await names({ limit: 1, offset: 1 })).toEqual(["a"]);
      });

      it("breaks name ties by id", async () => {
        const board = makeBoard();
        await h.repos.boards.insert(board);
        const twins = [makePipeline(board.id, { name: "same" }), makePipeline(board.id, { name: "same" })];
        for (const p of twins) await h.repos.pipelines.insert(p);
        const expected = twins.map((p) => p.id).sort();
        expect((await h.repos.pipelines.listByBoard(board.id, { limit: 5, offset: 0 })).map((p) => p.id)).toEqual(expected);
      });

      it("deleting a pipeline cascades to its stages; deleting the board cascades to pipelines", async () => {
        const { board, pipeline } = await seedPipeline(h);
        const stage = makeStage(pipeline);
        await h.repos.stages.insert(stage);
        await h.repos.pipelines.delete(pipeline.id);
        expect(await h.repos.stages.findById(stage.id)).toBeNull();
        const second = makePipeline(board.id);
        await h.repos.pipelines.insert(second);
        const child = makeStage(second);
        await h.repos.stages.insert(child);
        await h.repos.boards.delete(board.id);
        expect(await h.repos.pipelines.findById(second.id)).toBeNull();
        expect(await h.repos.stages.findById(child.id)).toBeNull();
      });
    });

    describe("stages", () => {
      it("round-trips and updates name, flag and position", async () => {
        const { pipeline } = await seedPipeline(h);
        const stage = makeStage(pipeline, { name: "Todo", isDone: false, position: "a0" });
        await h.repos.stages.insert(stage);
        expect(await h.repos.stages.findById(stage.id)).toEqual(stage);
        expect(await h.repos.stages.findById(uuid())).toBeNull();
        const changed = { ...stage, name: "Backlog", isDone: true, position: "b1" };
        await h.repos.stages.update(changed);
        expect(await h.repos.stages.findById(stage.id)).toEqual(changed);
      });

      it("lists a pipeline's stages bytewise by position then id; a page limits the result", async () => {
        const { pipeline } = await seedPipeline(h);
        const stages = [
          makeStage(pipeline, { position: "b" }),
          makeStage(pipeline, { position: "B" }),
          makeStage(pipeline, { position: "a" }),
        ];
        for (const s of stages) await h.repos.stages.insert(s);
        const [lower, upper, a] = [stages[0]!, stages[1]!, stages[2]!];
        expect((await h.repos.stages.listByPipeline(pipeline.id)).map((s) => s.id)).toEqual([upper.id, a.id, lower.id]);
        expect((await h.repos.stages.listByPipeline(pipeline.id, { limit: 1, offset: 1 })).map((s) => s.id)).toEqual([a.id]);
      });

      it("breaks position ties by id", async () => {
        const { pipeline } = await seedPipeline(h);
        const twins = [makeStage(pipeline), makeStage(pipeline)];
        for (const s of twins) await h.repos.stages.insert(s);
        expect((await h.repos.stages.listByPipeline(pipeline.id)).map((s) => s.id)).toEqual(twins.map((s) => s.id).sort());
      });

      it("rejects duplicate names per pipeline ignoring case (insert and update), allows them across pipelines", async () => {
        const { board, pipeline } = await seedPipeline(h);
        const other = makePipeline(board.id);
        await h.repos.pipelines.insert(other);
        const todo = makeStage(pipeline, { name: "Todo" });
        const doing = makeStage(pipeline, { name: "Doing" });
        await h.repos.stages.insert(todo);
        await h.repos.stages.insert(doing);
        await h.repos.stages.insert(makeStage(other, { name: "todo" }));
        await expect(h.repos.stages.insert(makeStage(pipeline, { name: "TODO" }))).rejects.toBeInstanceOf(ConflictError);
        await expect(h.repos.stages.update({ ...doing, name: "todo" })).rejects.toBeInstanceOf(ConflictError);
        await h.repos.stages.update({ ...todo, name: "TODO" });
        expect((await h.repos.stages.findById(todo.id))?.name).toBe("TODO");
      });

      it("allows at most one done stage per pipeline (insert and update)", async () => {
        const { board, pipeline } = await seedPipeline(h);
        const other = makePipeline(board.id);
        await h.repos.pipelines.insert(other);
        const done = makeStage(pipeline, { isDone: true });
        const open = makeStage(pipeline);
        await h.repos.stages.insert(done);
        await h.repos.stages.insert(open);
        await h.repos.stages.insert(makeStage(other, { isDone: true }));
        await expect(h.repos.stages.insert(makeStage(pipeline, { isDone: true }))).rejects.toBeInstanceOf(ConflictError);
        await expect(h.repos.stages.update({ ...open, isDone: true })).rejects.toBeInstanceOf(ConflictError);
        await h.repos.stages.update({ ...done, isDone: false });
        await h.repos.stages.update({ ...open, isDone: true });
        expect((await h.repos.stages.findById(open.id))?.isDone).toBe(true);
      });

      it("a conflicting write inside a transaction rolls the whole unit back", async () => {
        const { pipeline } = await seedPipeline(h);
        const first = makeStage(pipeline, { name: "A" });
        const second = makeStage(pipeline, { name: "B" });
        await expect(
          h.uow.run(async (tx) => {
            await tx.stages.insert(first);
            await tx.stages.insert(second);
            await tx.stages.update({ ...second, name: "a" });
          }),
        ).rejects.toBeInstanceOf(ConflictError);
        expect(await h.repos.stages.listByPipeline(pipeline.id)).toEqual([]);
      });

      it("reads inside a transaction return the same ordered data as plain reads", async () => {
        const { pipeline } = await seedPipeline(h);
        for (const position of ["b", "B", "a"]) await h.repos.stages.insert(makeStage(pipeline, { position }));
        const plain = await h.repos.stages.listByPipeline(pipeline.id);
        await h.uow.run(async (tx) => {
          expect(await tx.stages.listByPipeline(pipeline.id)).toEqual(plain);
          expect(await tx.stages.findById(plain[0]!.id)).toEqual(plain[0]);
          expect(await tx.pipelines.findById(pipeline.id)).toEqual(pipeline);
        });
      });
    });
  });
}
