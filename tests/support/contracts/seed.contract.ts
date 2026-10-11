import { beforeEach, describe, expect, it } from "vitest";
import { storageKeyFor } from "@/application/attachment-policy";
import {
  DEMO_BOARD_ID, DEMO_OWNER_ID, DEMO_VIEWER_ID, seedDemoBoard, type SeedDeps,
} from "@/infrastructure/seed/seed-demo-board";
import { isOverdue } from "@/domain/entities/task";
import { sequentialIds } from "@tests/support/app-context";
import { memoryFiles } from "@tests/support/seed-files";
import { uuid, type RepoHarness } from "./harness";

const NOW = new Date("2026-10-09T12:00:00.000Z");

/** The demo seed must behave identically on the fakes and on Postgres. */
export function runSeedContract(name: string, setup: () => RepoHarness): void {
  describe(`demo seed (${name})`, () => {
    const h = setup();
    const deps = (): SeedDeps => ({ uow: h.uow, ids: sequentialIds("5"), clock: { now: () => NOW } });
    beforeEach(() => h.reset());

    const snapshot = async (boardId: string) => {
      const pipelines = await h.repos.pipelines.listByBoard(boardId, { limit: 50, offset: 0 });
      const stages = await h.repos.stages.listByPipeline(pipelines[0]!.id);
      const tasks = await h.repos.tasks.listByPipeline(pipelines[0]!.id, { limit: 200, offset: 0 });
      const members = await h.repos.members.listByBoard(boardId, { limit: 50, offset: 0 });
      return { pipelines, stages, tasks, members };
    };

    it("creates a demo board with an owner, a read-only viewer and a realistic kanban", async () => {
      expect(await seedDemoBoard(deps(), { ownerId: DEMO_OWNER_ID, boardId: DEMO_BOARD_ID })).toEqual({
        created: true, boardId: DEMO_BOARD_ID,
      });
      const { pipelines, stages, tasks, members } = await snapshot(DEMO_BOARD_ID);
      expect(pipelines).toHaveLength(1);
      expect(stages.map((s) => s.name)).toEqual(["To do", "In progress", "Done"]);
      expect(stages.filter((s) => s.isDone).map((s) => s.name)).toEqual(["Done"]);
      expect(members.map((m) => [m.userId, m.role])).toEqual([[DEMO_OWNER_ID, "owner"], [DEMO_VIEWER_ID, "guest"]]);
      expect(tasks.length).toBeGreaterThanOrEqual(6);
      const doneId = stages.find((s) => s.isDone)!.id;
      for (const task of tasks) expect(task.completedAt !== null).toBe(task.stageId === doneId);
      expect(tasks.some((t) => isOverdue(t, NOW))).toBe(true);
      expect(tasks.some((t) => t.assigneeId === DEMO_OWNER_ID)).toBe(true);
      for (const stage of stages) {
        const positions = tasks.filter((t) => t.stageId === stage.id).map((t) => t.position);
        expect(new Set(positions).size).toBe(positions.length);
      }
    });

    it("is idempotent: a second run changes nothing", async () => {
      await seedDemoBoard(deps(), { ownerId: DEMO_OWNER_ID, boardId: DEMO_BOARD_ID });
      const before = await snapshot(DEMO_BOARD_ID);
      expect(await seedDemoBoard({ ...deps(), ids: sequentialIds("6") }, { ownerId: DEMO_OWNER_ID, boardId: DEMO_BOARD_ID })).toEqual({
        created: false, boardId: DEMO_BOARD_ID,
      });
      expect(await snapshot(DEMO_BOARD_ID)).toEqual(before);
    });

    const commentsOf = async (boardId: string) => {
      const { tasks } = await snapshot(boardId);
      const comments = (await Promise.all(tasks.map((t) => h.repos.comments.listByTask(t.id, { limit: 50, offset: 0 })))).flat();
      const attachments = await h.repos.attachments.listByComments(comments.map((c) => c.id));
      return { tasks, comments, attachments };
    };

    it("seeds comments written by the owner and by the read-only viewer, on tasks of the same board, oldest first", async () => {
      await seedDemoBoard(deps(), { ownerId: DEMO_OWNER_ID, boardId: DEMO_BOARD_ID });
      const { tasks, comments, attachments } = await commentsOf(DEMO_BOARD_ID);
      expect(comments.length).toBeGreaterThanOrEqual(4);
      expect(new Set(comments.map((c) => c.authorId))).toEqual(new Set([DEMO_OWNER_ID, DEMO_VIEWER_ID]));
      for (const comment of comments) {
        expect(comment.boardId).toBe(DEMO_BOARD_ID);
        expect(tasks.map((t) => t.id)).toContain(comment.taskId);
        expect(comment.body.length).toBeGreaterThan(0);
      }
      const onSameTask = comments.filter((c) => c.taskId === comments[0]!.taskId);
      expect(onSameTask.map((c) => c.createdAt.getTime())).toEqual([...onSameTask.map((c) => c.createdAt.getTime())].sort((a, b) => a - b));
      expect(attachments).toEqual([]); // nothing to store the bytes in: no attachment rows pointing at nothing
    });

    it("with a file store, seeds attachments on some comments only: confirmed, keyed by board and id, bytes stored (REQ-DEMO-01)", async () => {
      const { files, objects, puts } = memoryFiles();
      await seedDemoBoard(deps(), { ownerId: DEMO_OWNER_ID, boardId: DEMO_BOARD_ID, files });
      const { comments, attachments } = await commentsOf(DEMO_BOARD_ID);
      expect(attachments.length).toBeGreaterThanOrEqual(2);
      const withFile = new Set(attachments.map((a) => a.commentId));
      expect(withFile.size).toBeLessThan(comments.length); // comments with AND without an attachment
      for (const attachment of attachments) {
        expect(attachment).toMatchObject({ boardId: DEMO_BOARD_ID, status: "confirmed", uploaderId: DEMO_OWNER_ID });
        expect(attachment.storageKey).toBe(storageKeyFor(DEMO_BOARD_ID, attachment.id));
        expect(objects.get(attachment.storageKey)).toEqual({ contentType: attachment.contentType, size: attachment.size });
        expect(attachment.size).toBeGreaterThan(0);
      }
      expect(new Set(attachments.map((a) => a.contentType))).toEqual(new Set(["image/png", "text/plain"]));
      expect(puts).toHaveLength(attachments.length);
    });

    it("a second run uploads nothing and changes nothing", async () => {
      const { files, puts } = memoryFiles();
      await seedDemoBoard(deps(), { ownerId: DEMO_OWNER_ID, boardId: DEMO_BOARD_ID, files });
      const before = await commentsOf(DEMO_BOARD_ID);
      const uploaded = puts.length;
      expect(await seedDemoBoard({ ...deps(), ids: sequentialIds("6") }, { ownerId: DEMO_OWNER_ID, boardId: DEMO_BOARD_ID, files })).toMatchObject({ created: false });
      expect(puts).toHaveLength(uploaded);
      expect(await commentsOf(DEMO_BOARD_ID)).toEqual(before);
    });

    it("clones independent boards for other owners", async () => {
      const [a, b] = [uuid(), uuid()];
      await seedDemoBoard(deps(), { ownerId: "guest-1", boardId: a });
      await seedDemoBoard({ ...deps(), ids: sequentialIds("7") }, { ownerId: "guest-2", boardId: b });
      expect((await snapshot(a)).members.map((m) => m.userId)).toContain("guest-1");
      expect((await snapshot(b)).members.map((m) => m.userId)).toContain("guest-2");
      expect((await h.repos.boards.listByMember("guest-1", { limit: 9, offset: 0 })).map((x) => x.id)).toEqual([a]);
      expect((await snapshot(a)).tasks.length).toBe((await snapshot(b)).tasks.length);
    });
  });
}
