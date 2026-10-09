import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { pgConstraint, pgErrorCode } from "@/infrastructure/db/pg-error";
import * as t from "@/infrastructure/db/schema";
import { connectTestDb, resetDb } from "./support/db";

const handle = connectTestDb();
const { db } = handle;
const NOW = new Date("2026-10-09T12:00:00Z");
let n = 0;
const id = () => `00000000-0000-4000-8000-${(++n).toString(16).padStart(12, "0")}`;

async function seedTree() {
  const board = { id: id(), name: "b", description: "", status: "active" as const, createdAt: NOW };
  const pipeline = { id: id(), boardId: board.id, name: "p", description: "" };
  const stage = { id: id(), pipelineId: pipeline.id, boardId: board.id, name: "To do", isDone: false, position: "a0" };
  const task = {
    id: id(), boardId: board.id, pipelineId: pipeline.id, stageId: stage.id, title: "t", description: "",
    priority: "low" as const, status: "active" as const, dueDate: null, assigneeId: null, completedAt: null,
    position: "a0", createdAt: NOW,
  };
  await db.insert(t.boards).values(board);
  await db.insert(t.pipelines).values(pipeline);
  await db.insert(t.stages).values(stage);
  await db.insert(t.tasks).values(task);
  return { board, pipeline, stage, task };
}

/** Resolves to the SQLSTATE and constraint of the failure, or fails when the statement succeeds. */
async function violation(work: Promise<unknown>): Promise<{ code: string | undefined; constraint: string | undefined }> {
  try {
    await work;
  } catch (error) {
    return { code: pgErrorCode(error), constraint: pgConstraint(error) };
  }
  throw new Error("expected a database error");
}

beforeEach(() => resetDb(handle));
afterAll(() => handle.close());

describe("schema constraints", () => {
  it("rejects a second membership for the same (board, user)", async () => {
    const { board } = await seedTree();
    await db.insert(t.boardMembers).values({ boardId: board.id, userId: "u1", role: "owner" });
    const failure = await violation(db.insert(t.boardMembers).values({ boardId: board.id, userId: "u1", role: "member" }));
    expect(failure).toEqual({ code: "23505", constraint: "board_members_board_id_user_id_pk" });
  });

  it("rejects stage names that differ only by case inside a pipeline, but allows them across pipelines", async () => {
    const { board, pipeline } = await seedTree();
    const other = { id: id(), boardId: board.id, name: "p2", description: "" };
    await db.insert(t.pipelines).values(other);
    const stage = (pipelineId: string, name: string) => ({ id: id(), pipelineId, boardId: board.id, name, isDone: false, position: "a1" });
    const failure = await violation(db.insert(t.stages).values(stage(pipeline.id, "TO DO")));
    expect(failure).toEqual({ code: "23505", constraint: "stages_pipeline_lower_name_uq" });
    await db.insert(t.stages).values(stage(other.id, "to do"));
  });

  it("allows at most one done stage per pipeline", async () => {
    const { board, pipeline } = await seedTree();
    const stage = (name: string, isDone: boolean) => ({ id: id(), pipelineId: pipeline.id, boardId: board.id, name, isDone, position: "a1" });
    await db.insert(t.stages).values(stage("Done", true));
    const failure = await violation(db.insert(t.stages).values(stage("Closed", true)));
    expect(failure).toEqual({ code: "23505", constraint: "stages_pipeline_done_uq" });
    await db.insert(t.stages).values([stage("A", false), stage("B", false)]);
  });

  it("keeps the denormalized board id consistent with the pipeline", async () => {
    const { pipeline } = await seedTree();
    const stranger = { id: id(), name: "x", description: "", status: "active" as const, createdAt: NOW };
    await db.insert(t.boards).values(stranger);
    const stage = { id: id(), pipelineId: pipeline.id, boardId: stranger.id, name: "S", isDone: false, position: "a1" };
    expect((await violation(db.insert(t.stages).values(stage))).code).toBe("23503");
  });

  it("keeps a task's stage inside the task's pipeline", async () => {
    const { board, task } = await seedTree();
    const pipeline2 = { id: id(), boardId: board.id, name: "p2", description: "" };
    await db.insert(t.pipelines).values(pipeline2);
    const failure = await violation(db.update(t.tasks).set({ pipelineId: pipeline2.id }).where(eq(t.tasks.id, task.id)));
    expect(failure.code).toBe("23503");
  });

  it("rejects values outside the enums", async () => {
    const { board } = await seedTree();
    const failure = await violation(
      db.execute(sql`INSERT INTO board_members (board_id, user_id, role) VALUES (${board.id}, 'u', 'admin')`),
    );
    expect(failure.code).toBe("22P02");
  });

  it("orders positions bytewise (COLLATE C), not by locale", async () => {
    const { stage } = await seedTree();
    const { rows } = await db.execute<{ p: string }>(
      sql`SELECT p FROM (VALUES ('a'::text COLLATE "C"), ('B'), ('b')) AS v(p) ORDER BY p`,
    );
    expect(rows.map((r) => r.p)).toEqual(["B", "a", "b"]);
    const col = await db.execute<{ collation_name: string }>(
      sql`SELECT collation_name FROM information_schema.columns
          WHERE table_name IN ('stages', 'tasks') AND column_name = 'position'`,
    );
    expect(col.rows.map((r) => r.collation_name)).toEqual(["C", "C"]);
    expect(stage.position).toBe("a0");
  });
});

describe("cascades", () => {
  it("deleting a board removes every dependent row", async () => {
    const { board } = await seedTree();
    await db.insert(t.boardMembers).values({ boardId: board.id, userId: "u1", role: "owner" });
    await db.delete(t.boards).where(eq(t.boards.id, board.id));
    for (const table of [t.boardMembers, t.pipelines, t.stages, t.tasks]) {
      expect(await db.select().from(table)).toEqual([]);
    }
  });

  it("deleting a pipeline removes its stages and tasks; deleting a stage removes its tasks", async () => {
    const { pipeline, stage, task } = await seedTree();
    await db.delete(t.stages).where(eq(t.stages.id, stage.id));
    expect(await db.select().from(t.tasks).where(eq(t.tasks.id, task.id))).toEqual([]);
    await db.delete(t.pipelines).where(eq(t.pipelines.id, pipeline.id));
    expect(await db.select().from(t.stages)).toEqual([]);
  });

  it("deleting a task removes its comments and their attachments", async () => {
    const { board, task } = await seedTree();
    const comment = { id: id(), taskId: task.id, boardId: board.id, authorId: "u1", body: "hi", createdAt: NOW };
    await db.insert(t.comments).values(comment);
    await db.insert(t.attachments).values({
      id: id(), commentId: comment.id, boardId: board.id, uploaderId: "u1", storageKey: "k1", fileName: "f.png",
      contentType: "image/png", size: 10, status: "confirmed", createdAt: NOW,
    });
    await db.delete(t.tasks).where(eq(t.tasks.id, task.id));
    expect(await db.select().from(t.comments)).toEqual([]);
    expect(await db.select().from(t.attachments)).toEqual([]);
  });

  it("makes storage keys unique", async () => {
    const { board } = await seedTree();
    const attachment = (storageKey: string) => ({
      id: id(), commentId: null, boardId: board.id, uploaderId: "u1", storageKey, fileName: "f", contentType: "x/y",
      size: 1, status: "pending" as const, createdAt: NOW,
    });
    await db.insert(t.attachments).values(attachment("k"));
    expect((await violation(db.insert(t.attachments).values(attachment("k")))).code).toBe("23505");
  });
});
