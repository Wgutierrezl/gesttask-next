import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { NotFoundError } from "@/domain/errors";
import { at, makeAttachment, makeBoard, makeComment, makePipeline, makeStage, makeTask, seedTask, uuid, type RepoHarness } from "./harness";

/** Behaviour every CommentRepo / AttachmentRepo / deletion-outbox binding must share, FK cascades included. */
export function runCommentContract(name: string, setup: () => RepoHarness): void {
  describe(`comment repository (${name})`, () => {
    const h = setup();
    beforeEach(() => h.reset());
    afterAll(() => h.close?.());

    it("round-trips a comment, with and without an author, and returns null for an unknown id", async () => {
      const { task } = await seedTask(h);
      const mine = makeComment(task, { authorId: "alice", body: "Hello", createdAt: at(5) });
      const orphan = makeComment(task, { authorId: null });
      await h.repos.comments.insert(mine);
      await h.repos.comments.insert(orphan);
      expect(await h.repos.comments.findById(mine.id)).toEqual(mine);
      expect((await h.repos.comments.findById(orphan.id))?.authorId).toBeNull();
      expect(await h.repos.comments.findById(uuid())).toBeNull();
    });

    it("refuses a comment whose task does not exist or lives on another board", async () => {
      const { task } = await seedTask(h);
      const elsewhere = makeBoard();
      await h.repos.boards.insert(elsewhere);
      await expect(h.repos.comments.insert(makeComment(task, { taskId: uuid() }))).rejects.toBeInstanceOf(NotFoundError);
      await expect(h.repos.comments.insert(makeComment(task, { boardId: elsewhere.id }))).rejects.toBeInstanceOf(NotFoundError);
    });

    it("lists one task's comments oldest first, then by id, paginated", async () => {
      const { task, stage } = await seedTask(h);
      const other = makeTask(stage);
      await h.repos.tasks.insert(other);
      const late = makeComment(task, { createdAt: at(30) });
      const tieA = makeComment(task, { createdAt: at(10) });
      const tieB = makeComment(task, { createdAt: at(10) });
      for (const c of [late, tieB, tieA, makeComment(other)]) await h.repos.comments.insert(c);
      const ties = [tieA.id, tieB.id].sort();
      const ids = async (page: { limit: number; offset: number }) => (await h.repos.comments.listByTask(task.id, page)).map((c) => c.id);
      expect(await ids({ limit: 10, offset: 0 })).toEqual([...ties, late.id]);
      expect(await ids({ limit: 1, offset: 1 })).toEqual([ties[1]]);
    });

    it("updates only the body", async () => {
      const { task } = await seedTask(h);
      const comment = makeComment(task, { body: "before", authorId: "alice" });
      await h.repos.comments.insert(comment);
      await h.repos.comments.updateBody(comment.id, "after");
      expect(await h.repos.comments.findById(comment.id)).toEqual({ ...comment, body: "after" });
    });

    it("deleting a comment removes its attachments with it", async () => {
      const { task, board } = await seedTask(h);
      const comment = makeComment(task);
      await h.repos.comments.insert(comment);
      const attachment = makeAttachment(board.id, { commentId: comment.id, status: "confirmed" });
      await h.repos.attachments.insert(attachment);
      await h.repos.comments.delete(comment.id);
      expect(await h.repos.comments.findById(comment.id)).toBeNull();
      expect(await h.repos.attachments.findById(attachment.id)).toBeNull();
    });

    it.each([
      ["task", (s: Awaited<ReturnType<typeof seedTask>>, h2: RepoHarness) => h2.repos.tasks.delete(s.task.id)],
      ["stage", (s: Awaited<ReturnType<typeof seedTask>>, h2: RepoHarness) => h2.repos.stages.delete(s.stage.id)],
      ["pipeline", (s: Awaited<ReturnType<typeof seedTask>>, h2: RepoHarness) => h2.repos.pipelines.delete(s.pipeline.id)],
      ["board", (s: Awaited<ReturnType<typeof seedTask>>, h2: RepoHarness) => h2.repos.boards.delete(s.board.id)],
    ])("deleting the %s cascades to comments and attachments", async (_scope, remove) => {
      const seeded = await seedTask(h);
      const comment = makeComment(seeded.task);
      await h.repos.comments.insert(comment);
      const attachment = makeAttachment(seeded.board.id, { commentId: comment.id, status: "confirmed" });
      await h.repos.attachments.insert(attachment);
      await remove(seeded, h);
      expect(await h.repos.comments.findById(comment.id)).toBeNull();
      expect(await h.repos.attachments.findById(attachment.id)).toBeNull();
    });
  });

  describe(`attachment repository (${name})`, () => {
    const h = setup();
    beforeEach(() => h.reset());
    afterAll(() => h.close?.());

    it("round-trips a pending attachment and refuses a duplicated storage key (a bug, so it surfaces as itself)", async () => {
      const { board } = await seedTask(h);
      const attachment = makeAttachment(board.id, { uploaderId: "alice", fileName: "report.pdf", contentType: "application/pdf", size: 2048 });
      await h.repos.attachments.insert(attachment);
      expect(await h.repos.attachments.findById(attachment.id)).toEqual(attachment);
      expect(await h.repos.attachments.findById(uuid())).toBeNull();
      await expect(h.repos.attachments.insert(makeAttachment(board.id, { storageKey: attachment.storageKey }))).rejects.toThrow();
    });

    it("refuses an attachment for a board that does not exist", async () => {
      await expect(h.repos.attachments.insert(makeAttachment(uuid()))).rejects.toBeInstanceOf(NotFoundError);
    });

    it("finds several by id and ignores unknown ones", async () => {
      const { board } = await seedTask(h);
      const [a, b] = [makeAttachment(board.id), makeAttachment(board.id)];
      await h.repos.attachments.insert(a);
      await h.repos.attachments.insert(b);
      const found = await h.repos.attachments.findManyByIds([b.id, uuid(), a.id]);
      expect(found.map((x) => x.id).sort()).toEqual([a.id, b.id].sort());
    });

    it("confirming links the attachment to the comment and records the real size", async () => {
      const { board, task } = await seedTask(h);
      const comment = makeComment(task);
      await h.repos.comments.insert(comment);
      const attachment = makeAttachment(board.id, { size: 5000 });
      await h.repos.attachments.insert(attachment);
      await h.repos.attachments.confirm(attachment.id, { commentId: comment.id, size: 4321 });
      expect(await h.repos.attachments.findById(attachment.id)).toEqual({ ...attachment, commentId: comment.id, size: 4321, status: "confirmed" });
    });

    it("lists the confirmed attachments of the given comments, oldest first", async () => {
      const { board, task } = await seedTask(h);
      const [c1, c2, c3] = [makeComment(task), makeComment(task), makeComment(task)] as const;
      for (const c of [c1, c2, c3]) await h.repos.comments.insert(c);
      const newer = makeAttachment(board.id, { commentId: c1.id, status: "confirmed", createdAt: at(20) });
      const older = makeAttachment(board.id, { commentId: c1.id, status: "confirmed", createdAt: at(10) });
      const second = makeAttachment(board.id, { commentId: c2.id, status: "confirmed" });
      const unrelated = makeAttachment(board.id, { commentId: c3.id, status: "confirmed" });
      for (const a of [newer, older, second, unrelated]) await h.repos.attachments.insert(a);
      const listed = await h.repos.attachments.listByComments([c1.id, c2.id]);
      expect(listed.map((a) => a.id)).toEqual([second.id, older.id, newer.id]);
      expect(await h.repos.attachments.listByComments([])).toEqual([]);
    });

    it("counts a user's confirmed attachments plus pending ones newer than the cutoff", async () => {
      const { board } = await seedTask(h);
      const cutoff = at(100);
      const rows = [
        makeAttachment(board.id, { uploaderId: "alice", status: "confirmed", createdAt: at(1) }),
        makeAttachment(board.id, { uploaderId: "alice", status: "pending", createdAt: at(150) }),
        makeAttachment(board.id, { uploaderId: "alice", status: "pending", createdAt: at(50) }),
        makeAttachment(board.id, { uploaderId: "bob", status: "confirmed", createdAt: at(150) }),
      ];
      for (const row of rows) await h.repos.attachments.insert(row);
      expect(await h.repos.attachments.countByUploader("alice", cutoff)).toBe(2);
      expect(await h.repos.attachments.countByUploader("bob", cutoff)).toBe(1);
      expect(await h.repos.attachments.countByUploader("nobody", cutoff)).toBe(0);
    });

    describe("keysUnder: the storage keys that die with a delete", () => {
      async function scenario() {
        const seeded = await seedTask(h);
        const sibling = makeTask(seeded.stage);
        await h.repos.tasks.insert(sibling);
        const otherStage = makeStage(seeded.pipeline, { position: "b" });
        await h.repos.stages.insert(otherStage);
        const farTask = makeTask(otherStage);
        await h.repos.tasks.insert(farTask);
        const otherPipeline = makePipeline(seeded.board.id);
        await h.repos.pipelines.insert(otherPipeline);
        const otherPipelineStage = makeStage(otherPipeline);
        await h.repos.stages.insert(otherPipelineStage);
        const pipelineTask = makeTask(otherPipelineStage);
        await h.repos.tasks.insert(pipelineTask);
        const elsewhere = await seedTask(h);

        const keyed: Record<string, string> = {};
        for (const [label, task] of Object.entries({ task: seeded.task, sibling, farTask, pipelineTask, elsewhere: elsewhere.task })) {
          const comment = makeComment(task);
          await h.repos.comments.insert(comment);
          const attachment = makeAttachment(task.boardId, { commentId: comment.id, status: "confirmed" });
          await h.repos.attachments.insert(attachment);
          keyed[label] = attachment.storageKey;
          if (label === "task") keyed.commentId = comment.id;
        }
        const pending = makeAttachment(seeded.board.id);
        await h.repos.attachments.insert(pending);
        return { ...seeded, otherStage, otherPipeline, keyed, pendingKey: pending.storageKey };
      }
      const sorted = (keys: string[]) => [...keys].sort();

      it("by comment: only that comment's attachments", async () => {
        const s = await scenario();
        expect(await h.repos.attachments.keysUnder({ commentId: s.keyed.commentId! })).toEqual([s.keyed.task]);
      });

      it("by task: the attachments of its comments", async () => {
        const s = await scenario();
        expect(await h.repos.attachments.keysUnder({ taskId: s.task.id })).toEqual([s.keyed.task]);
      });

      it("by stage: every task of the stage, not the tasks of other stages", async () => {
        const s = await scenario();
        expect(sorted(await h.repos.attachments.keysUnder({ stageId: s.stage.id }))).toEqual(sorted([s.keyed.task!, s.keyed.sibling!]));
        expect(await h.repos.attachments.keysUnder({ stageId: s.otherStage.id })).toEqual([s.keyed.farTask]);
      });

      it("by pipeline: every stage of the pipeline, not other pipelines", async () => {
        const s = await scenario();
        expect(sorted(await h.repos.attachments.keysUnder({ pipelineId: s.pipeline.id }))).toEqual(
          sorted([s.keyed.task!, s.keyed.sibling!, s.keyed.farTask!]),
        );
        expect(await h.repos.attachments.keysUnder({ pipelineId: s.otherPipeline.id })).toEqual([s.keyed.pipelineTask]);
      });

      it("by board: everything on the board, pending uploads included, and nothing from other boards", async () => {
        const s = await scenario();
        const keys = await h.repos.attachments.keysUnder({ boardId: s.board.id });
        expect(sorted(keys)).toEqual(sorted([s.keyed.task!, s.keyed.sibling!, s.keyed.farTask!, s.keyed.pipelineTask!, s.pendingKey]));
        expect(keys).not.toContain(s.keyed.elsewhere);
      });

      it("is empty when nothing is attached", async () => {
        const { task } = await seedTask(h);
        expect(await h.repos.attachments.keysUnder({ taskId: task.id })).toEqual([]);
      });
    });
  });

  describe(`deletion outbox inside a unit of work (${name})`, () => {
    const h = setup();
    beforeEach(() => h.reset());
    afterAll(() => h.close?.());

    it("keys enqueued by a committed transaction can be claimed afterwards", async () => {
      await h.uow.run((tx) => tx.outbox.enqueue(["boards/b/a1", "boards/b/a2"]));
      expect((await h.repos.outbox.claim(10)).map((row) => row.storageKey)).toEqual(["boards/b/a1", "boards/b/a2"]);
    });

    it("keys enqueued by a transaction that rolls back never reach the queue", async () => {
      const failing = h.uow.run(async (tx) => {
        await tx.outbox.enqueue(["boards/b/a1"]);
        throw new Error("boom");
      });
      await expect(failing).rejects.toThrow("boom");
      expect(await h.repos.outbox.claim(10)).toEqual([]);
    });

    it("claims and settles rows with lease ownership, like the Postgres outbox", async () => {
      await h.uow.run((tx) => tx.outbox.enqueue(["k1", "k2"]));
      const [first, second] = await h.repos.outbox.claim(10);
      expect(await h.repos.outbox.claim(10)).toEqual([]);
      expect(await h.repos.outbox.complete(first!)).toBe(true);
      expect(await h.repos.outbox.complete(first!)).toBe(false);
      expect(await h.repos.outbox.fail(second!)).toBe(true);
    });
  });
}
