import { beforeEach, describe, expect, it } from "vitest";
import { ForbiddenError, NotFoundError, ValidationError } from "@/domain/errors";
import type { Attachment } from "@/domain/entities/comment";
import { InMemoryUserDirectory } from "@/infrastructure/repos/in-memory-users";
import { createTestContext, type TestContext } from "@tests/support/app-context";
import { GUEST, MEMBER, OWNER, RIVAL, STRANGER, actor, seedKanban } from "@tests/support/fixtures";
import { makeCreateTask } from "../tasks/create-task";
import { makeCreateComment } from "./create-comment";
import { makeDeleteComment } from "./delete-comment";
import { makeEditComment } from "./edit-comment";
import { makeListComments } from "./list-comments";

const directory = new InMemoryUserDirectory([
  { id: "owner", name: "Olivia Owner", email: "olivia@example.com" },
  { id: "member", name: "Marco Member", email: "marco@example.com" },
  { id: "guest", name: "Guest", email: null },
]);

describe("comments", () => {
  let ctx: TestContext;
  let k: Awaited<ReturnType<typeof seedKanban>>;
  let taskId: string;
  const create = (who = OWNER, input: object = {}) => makeCreateComment(ctx)(who, { taskId, body: "Looks good", ...input });
  const list = (who = OWNER, input: object = {}) => makeListComments(ctx, directory)(who, { taskId, ...input });

  beforeEach(async () => {
    ctx = createTestContext();
    k = await seedKanban(ctx);
    taskId = (await makeCreateTask(ctx)(OWNER, { stageId: k.todoId, title: "Task" })).id;
  });

  describe("createComment (REQ-CMT-01)", () => {
    it("stores the text with the session user as author and the task's board, ignoring ids in the payload", async () => {
      const comment = await create(MEMBER, { authorId: "owner", boardId: "somewhere-else", body: "  Trimmed  " });
      expect(comment).toMatchObject({ taskId, boardId: k.boardId, authorId: "member", body: "Trimmed", createdAt: ctx.clock.now() });
      expect(await ctx.repos.comments.findById(comment.id)).toEqual(comment);
    });

    it("lets a guest-role member comment with text (REQ-BRD-06)", async () => {
      expect((await create(GUEST)).authorId).toBe("guest");
    });

    it.each([[{ body: "" }], [{ body: "   " }], [{ body: "x".repeat(2001) }], [{ body: 42 }]])("rejects %o", async (input) => {
      await expect(create(OWNER, input)).rejects.toBeInstanceOf(ValidationError);
      expect(ctx.store.comments.size).toBe(0);
    });

    it("accepts exactly 2000 characters", async () => {
      expect((await create(OWNER, { body: "x".repeat(2000) })).body).toHaveLength(2000);
    });

    it("answers NotFound to a stranger and for a task that does not exist, creating nothing", async () => {
      await expect(create(STRANGER)).rejects.toBeInstanceOf(NotFoundError);
      await expect(makeCreateComment(ctx)(OWNER, { taskId: "00000000-0000-4000-8000-0000000fffff", body: "x" })).rejects.toBeInstanceOf(NotFoundError);
      expect(ctx.store.comments.size).toBe(0);
    });
  });

  describe("listComments", () => {
    it("returns the task's comments oldest first with author names, and flags 'Deleted user' for missing authors", async () => {
      await create(OWNER, { body: "first" });
      ctx.clock.set(new Date("2026-10-09T12:05:00.000Z"));
      const second = await create(MEMBER, { body: "second" });
      ctx.store.comments.get(second.id)!.authorId = null;
      ctx.clock.set(new Date("2026-10-09T12:10:00.000Z"));
      await ctx.repos.members.insert({ boardId: k.boardId, userId: "ghost", role: "member" });
      await create(actor("ghost"), { body: "third" });
      const views = await list(OWNER);
      expect(views.map((v) => [v.body, v.authorName])).toEqual([["first", "Olivia Owner"], ["second", "Deleted user"], ["third", "Deleted user"]]);
      expect(views.map((v) => v.authorId)).toEqual(["owner", null, "ghost"]);
    });

    it("never exposes email addresses", async () => {
      await create(OWNER);
      expect(JSON.stringify(await list(MEMBER))).not.toContain("@example.com");
    });

    it("lets a guest-role member read, and answers NotFound to a stranger", async () => {
      await create(OWNER);
      expect(await list(GUEST)).toHaveLength(1);
      await expect(list(STRANGER)).rejects.toBeInstanceOf(NotFoundError);
    });

    it("includes only confirmed attachment metadata for each comment, never storage keys", async () => {
      const comment = await create(OWNER);
      const base: Attachment = {
        id: "a1", commentId: comment.id, boardId: k.boardId, uploaderId: "owner", storageKey: "boards/x/secret-key", fileName: "cat.png",
        contentType: "image/png", size: 100, status: "confirmed", createdAt: ctx.clock.now(),
      };
      ctx.store.attachments.set("a1", base);
      const [view] = await list(MEMBER);
      expect(view!.attachments).toEqual([{ id: "a1", fileName: "cat.png", contentType: "image/png", size: 100 }]);
      expect(JSON.stringify(view)).not.toContain("secret-key");
    });

    it("tells each viewer what they may change: own comments, or everything for the owner role", async () => {
      await create(OWNER, { body: "by owner" });
      await create(MEMBER, { body: "by member" });
      await create(GUEST, { body: "by guest" });
      const canManage = async (who: typeof OWNER) => (await list(who)).map((v) => v.canManage);
      expect(await canManage(OWNER)).toEqual([true, true, true]);
      expect(await canManage(MEMBER)).toEqual([false, true, false]);
      expect(await canManage(GUEST)).toEqual([false, false, true]);
    });

    it("paginates", async () => {
      for (const body of ["a", "b", "c"]) await create(OWNER, { body });
      expect((await list(OWNER, { limit: 2, offset: 1 })).map((v) => v.body)).toEqual(["b", "c"]);
    });
  });

  describe("editComment (REQ-BRD-06)", () => {
    const edit = (who: typeof OWNER, commentId: string, body = "Edited") => makeEditComment(ctx)(who, { commentId, body });

    it("lets everyone edit their own comment, guest role included", async () => {
      for (const who of [OWNER, MEMBER, GUEST]) {
        const own = await create(who, { body: "before" });
        expect((await edit(who, own.id)).body).toBe("Edited");
        expect((await ctx.repos.comments.findById(own.id))?.body).toBe("Edited");
      }
    });

    it("lets the owner moderate someone else's comment, keeping the author", async () => {
      const theirs = await create(MEMBER, { body: "mine" });
      const edited = await edit(OWNER, theirs.id, "moderated");
      expect(edited).toMatchObject({ body: "moderated", authorId: "member" });
    });

    it.each([["member", MEMBER], ["guest", GUEST]])("refuses a %s editing another user's comment with Forbidden", async (_label, who) => {
      const theirs = await create(OWNER, { body: "owner's" });
      await expect(edit(who, theirs.id)).rejects.toBeInstanceOf(ForbiddenError);
      expect((await ctx.repos.comments.findById(theirs.id))?.body).toBe("owner's");
    });

    it("answers NotFound to a stranger, to a rival's id and for a comment that does not exist", async () => {
      const mine = await create(OWNER);
      await expect(edit(STRANGER, mine.id)).rejects.toBeInstanceOf(NotFoundError);
      await expect(edit(RIVAL, mine.id)).rejects.toBeInstanceOf(NotFoundError);
      await expect(edit(OWNER, "00000000-0000-4000-8000-0000000fffff")).rejects.toBeInstanceOf(NotFoundError);
      expect((await ctx.repos.comments.findById(mine.id))?.body).toBe("Looks good");
    });

    it.each([[""], ["x".repeat(2001)]])("rejects invalid text %j and keeps the old one", async (body) => {
      const mine = await create(OWNER);
      await expect(edit(OWNER, mine.id, body)).rejects.toBeInstanceOf(ValidationError);
      expect((await ctx.repos.comments.findById(mine.id))?.body).toBe("Looks good");
    });
  });

  describe("deleteComment (REQ-BRD-06, REQ-CAS-02)", () => {
    const remove = (who: typeof OWNER, commentId: string, c: TestContext = ctx) => makeDeleteComment(c)(who, { commentId });
    const attach = (commentId: string, id: string): Attachment => {
      const attachment: Attachment = {
        id, commentId, boardId: k.boardId, uploaderId: "owner", storageKey: `boards/${k.boardId}/${id}`, fileName: `${id}.png`,
        contentType: "image/png", size: 10, status: "confirmed", createdAt: ctx.clock.now(),
      };
      ctx.store.attachments.set(id, attachment);
      return attachment;
    };

    it("lets everyone delete their own comment and the owner delete anyone's", async () => {
      for (const who of [MEMBER, GUEST]) {
        const own = await create(who);
        await remove(who, own.id);
        expect(await ctx.repos.comments.findById(own.id)).toBeNull();
      }
      const theirs = await create(MEMBER);
      await remove(OWNER, theirs.id);
      expect(ctx.store.comments.size).toBe(0);
    });

    it.each([["member", MEMBER], ["guest", GUEST]])("refuses a %s deleting another user's comment with Forbidden", async (_label, who) => {
      const theirs = await create(OWNER);
      await expect(remove(who, theirs.id)).rejects.toBeInstanceOf(ForbiddenError);
      expect(ctx.store.comments.size).toBe(1);
    });

    it("answers NotFound to a stranger and for a missing comment", async () => {
      const mine = await create(OWNER);
      await expect(remove(STRANGER, mine.id)).rejects.toBeInstanceOf(NotFoundError);
      await expect(remove(OWNER, "00000000-0000-4000-8000-0000000fffff")).rejects.toBeInstanceOf(NotFoundError);
      expect(ctx.store.comments.size).toBe(1);
    });

    it("queues the comment's attachment keys in the same transaction as the delete, and only its own", async () => {
      const doomed = await create(OWNER, { body: "doomed" });
      const kept = await create(OWNER, { body: "kept" });
      const [a, b] = [attach(doomed.id, "a"), attach(doomed.id, "b")];
      const other = attach(kept.id, "c");
      await remove(OWNER, doomed.id);
      expect([...ctx.store.storageDeletions.values()].map((row) => row.storageKey).sort()).toEqual([a.storageKey, b.storageKey].sort());
      expect(ctx.store.attachments.has(other.id)).toBe(true);
      expect(ctx.store.attachments.has(a.id)).toBe(false);
    });

    it("a comment without attachments queues nothing", async () => {
      const plain = await create(OWNER);
      await remove(OWNER, plain.id);
      expect(ctx.store.storageDeletions.size).toBe(0);
    });

    it("if queueing fails nothing is deleted and nothing is queued (the delete and the queue are one transaction)", async () => {
      const doomed = await create(OWNER);
      attach(doomed.id, "a");
      const broken: TestContext = {
        ...ctx,
        uow: { run: (work) => ctx.uow.run((tx) => work({ ...tx, outbox: { ...tx.outbox, enqueue: async () => { throw new Error("queue down"); } } })) },
      };
      await expect(remove(OWNER, doomed.id, broken)).rejects.toThrow("queue down");
      expect(ctx.store.comments.has(doomed.id)).toBe(true);
      expect(ctx.store.attachments.has("a")).toBe(true);
      expect(ctx.store.storageDeletions.size).toBe(0);
    });
  });
});
