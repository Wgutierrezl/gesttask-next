import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { pgConstraint, pgErrorCode } from "@/infrastructure/db/pg-error";
import * as t from "@/infrastructure/db/schema";
import { withoutAutoUsers } from "./support/auto-users";
import { connectTestDb, resetDb } from "./support/db";

const handle = connectTestDb();
const { db } = handle;
const NOW = new Date("2026-10-09T12:00:00Z");
let n = 0;
const id = () => `00000000-0000-4000-8000-${(++n).toString(16).padStart(12, "0")}`;

const user = (userId: string) => ({ id: userId, name: userId, email: `${userId}@x.test`, emailVerified: false, createdAt: NOW, updatedAt: NOW });

/** A board, pipeline, stage and task, with the given users already in the `user` table. */
async function tree(users: string[]) {
  for (const u of users) await db.insert(t.user).values(user(u));
  const board = { id: id(), name: "b", description: "", status: "active" as const, createdAt: NOW };
  const pipeline = { id: id(), boardId: board.id, name: "p", description: "" };
  const stage = { id: id(), pipelineId: pipeline.id, boardId: board.id, name: "To do", isDone: false, position: "a0" };
  const task = {
    id: id(), boardId: board.id, pipelineId: pipeline.id, stageId: stage.id, title: "t", description: "",
    priority: "low" as const, status: "active" as const, dueDate: null, assigneeId: null, completedAt: null, position: "a0", createdAt: NOW,
  };
  await db.insert(t.boards).values(board);
  await db.insert(t.pipelines).values(pipeline);
  await db.insert(t.stages).values(stage);
  await db.insert(t.tasks).values(task);
  return { board, task };
}

async function violation(work: Promise<unknown>) {
  try {
    await work;
  } catch (error) {
    return { code: pgErrorCode(error), constraint: pgConstraint(error) };
  }
  throw new Error("expected a database error");
}

beforeEach(() => resetDb(handle));
afterAll(() => handle.close());

describe("foreign keys to the auth user table", () => {
  it("rejects memberships, assignees, authors and uploaders that are not users", async () => {
    await withoutAutoUsers(handle, async () => {
      const { board, task } = await tree(["real"]);
      expect(await violation(db.insert(t.boardMembers).values({ boardId: board.id, userId: "ghost", role: "member" })))
        .toEqual({ code: "23503", constraint: "board_members_user_id_user_id_fk" });
      expect(await violation(db.update(t.tasks).set({ assigneeId: "ghost" }).where(eq(t.tasks.id, task.id))))
        .toEqual({ code: "23503", constraint: "tasks_assignee_id_user_id_fk" });
      expect(await violation(db.insert(t.comments).values({ id: id(), taskId: task.id, boardId: board.id, authorId: "ghost", body: "x", createdAt: NOW })))
        .toEqual({ code: "23503", constraint: "comments_author_id_user_id_fk" });
      expect(await violation(db.insert(t.attachments).values({
        id: id(), commentId: null, boardId: board.id, uploaderId: "ghost", storageKey: "k", fileName: "f", contentType: "x/y", size: 1, createdAt: NOW,
      }))).toEqual({ code: "23503", constraint: "attachments_uploader_id_user_id_fk" });
    });
  });

  it("deleting a user removes their memberships and unassigns their tasks", async () => {
    const { board, task } = await tree(["owner", "worker"]);
    await db.insert(t.boardMembers).values([
      { boardId: board.id, userId: "owner", role: "owner" }, { boardId: board.id, userId: "worker", role: "member" },
    ]);
    await db.update(t.tasks).set({ assigneeId: "worker" }).where(eq(t.tasks.id, task.id));
    await db.delete(t.user).where(eq(t.user.id, "worker"));
    expect((await db.select().from(t.boardMembers)).map((r) => r.userId)).toEqual(["owner"]);
    expect((await db.select().from(t.tasks))[0]?.assigneeId).toBeNull();
  });

  it("keeps comments and attachments when their author is deleted, with the author set to null (migration 0005)", async () => {
    const { board, task } = await tree(["owner", "author"]);
    const comment = { id: id(), taskId: task.id, boardId: board.id, authorId: "author", body: "keep", createdAt: NOW };
    await db.insert(t.comments).values(comment);
    await db.insert(t.attachments).values({
      id: id(), commentId: comment.id, boardId: board.id, uploaderId: "author", storageKey: "k1", fileName: "f", contentType: "x/y", size: 1, createdAt: NOW,
    });
    await db.delete(t.user).where(eq(t.user.id, "author"));
    expect((await db.select().from(t.comments)).map((c) => [c.body, c.authorId])).toEqual([["keep", null]]);
    expect((await db.select().from(t.attachments)).map((x) => [x.storageKey, x.uploaderId])).toEqual([["k1", null]]);
  });

  it("deleting a user cascades to their sessions and accounts", async () => {
    await db.insert(t.user).values(user("u"));
    await db.insert(t.session).values({ id: "s", userId: "u", token: "tok", expiresAt: NOW, createdAt: NOW, updatedAt: NOW });
    await db.insert(t.account).values({ id: "a", userId: "u", accountId: "u", providerId: "credential", createdAt: NOW, updatedAt: NOW });
    await db.delete(t.user).where(eq(t.user.id, "u"));
    const { rows } = await db.execute<{ n: number }>(sql`SELECT (SELECT count(*) FROM session) + (SELECT count(*) FROM account) AS n`);
    expect(Number(rows[0]?.n)).toBe(0);
  });

  it("keeps user emails unique and anonymous users flagged false by default", async () => {
    await db.insert(t.user).values(user("a"));
    expect(await violation(db.insert(t.user).values({ ...user("b"), email: "a@x.test" }))).toMatchObject({ code: "23505" });
    expect((await db.select().from(t.user))[0]?.isAnonymous).toBe(false);
  });
});

describe("test fixture", () => {
  it("auto-provisions referenced users so other suites need no user setup", async () => {
    const { board } = await tree([]);
    await db.insert(t.boardMembers).values({ boardId: board.id, userId: "implicit", role: "owner" });
    expect((await db.select().from(t.user)).map((u) => u.id)).toEqual(["implicit"]);
  });
});
