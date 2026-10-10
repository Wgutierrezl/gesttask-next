import { beforeEach, describe, expect, it } from "vitest";
import { ConflictError, ForbiddenError, NotFoundError, RateLimitError, StorageError, ValidationError } from "@/domain/errors";
import type { Attachment } from "@/domain/entities/comment";
import { InMemoryRateLimiter } from "@/infrastructure/ratelimit/in-memory-rate-limiter";
import { InMemoryUserDirectory } from "@/infrastructure/repos/in-memory-users";
import { FakeStorage } from "@tests/support/fake-storage";
import { createTestContext, type TestContext } from "@tests/support/app-context";
import { GUEST, MEMBER, OWNER, RIVAL, STRANGER, seedKanban } from "@tests/support/fixtures";
import { makeCreateTask } from "../tasks/create-task";
import { makeCreateComment } from "../comments/create-comment";
import { makeListComments } from "../comments/list-comments";
import { makeGetAttachmentUrl } from "./get-attachment-url";
import { makeRequestUpload } from "./request-upload";
import { ALLOWED_CONTENT_TYPES, MAX_ATTACHMENT_BYTES } from "../../attachment-policy";

const MB = 1024 * 1024;
const GUEST_USER = { userId: "guest-user", isGuest: true };

describe("attachments", () => {
  let ctx: TestContext;
  let storage: FakeStorage;
  let k: Awaited<ReturnType<typeof seedKanban>>;
  let taskId: string;
  const upload = (who = OWNER, input: object = {}) =>
    makeRequestUpload(ctx, { storage, limiter: new InMemoryRateLimiter(ctx.clock) })(who, { taskId, fileName: "photo.png", contentType: "image/png", size: 1000, ...input });
  const comment = (who = OWNER, input: object = {}) => makeCreateComment(ctx, { storage })(who, { taskId, body: "See attached", ...input });
  /** Requests a ticket and plays the browser: the object lands in storage. */
  async function uploaded(who = OWNER, input: { size?: number; contentType?: string; actual?: { size?: number; contentType?: string } } = {}) {
    const { attachmentId } = await upload(who, { size: input.size ?? 1000, contentType: input.contentType ?? "image/png" });
    const row = ctx.store.attachments.get(attachmentId)!;
    storage.upload(row.storageKey, input.actual?.size ?? row.size, input.actual?.contentType ?? row.contentType);
    return row;
  }

  beforeEach(async () => {
    ctx = createTestContext();
    storage = new FakeStorage();
    k = await seedKanban(ctx);
    taskId = (await makeCreateTask(ctx)(OWNER, { stageId: k.todoId, title: "Task" })).id;
  });

  describe("requestUpload (REQ-CMT-02, REQ-ATT-01, REQ-ATT-03)", () => {
    it("issues a ticket and records a pending attachment under a server-made key", async () => {
      const result = await upload(MEMBER, { fileName: "  holiday.png  ", size: 2048 });
      const row = ctx.store.attachments.get(result.attachmentId)!;
      expect(row).toEqual({
        id: result.attachmentId, commentId: null, boardId: k.boardId, uploaderId: "member", storageKey: `boards/${k.boardId}/attachments/${result.attachmentId}`,
        fileName: "holiday.png", contentType: "image/png", size: 2048, status: "pending", createdAt: ctx.clock.now(),
      });
      expect(storage.prepared).toEqual([{ key: row.storageKey, contentType: "image/png", size: 2048 }]);
      expect(result.ticket).toEqual({ kind: "local-put", url: `https://storage.test/put/${row.storageKey}` });
    });

    it.each([["../../etc/passwd.png", "passwd.png"], ["C:\\Users\\me\\scan.pdf", "scan.pdf"], ["a\u0000b\nc.txt", "abc.txt"], ["x".repeat(300) + ".png", "x".repeat(120)]])(
      "never lets the client's name %j reach the key; stores the sanitized %j",
      async (fileName, expected) => {
        const { attachmentId } = await upload(OWNER, { fileName });
        const row = ctx.store.attachments.get(attachmentId)!;
        expect(row.fileName).toBe(expected);
        expect(row.storageKey).toBe(`boards/${k.boardId}/attachments/${attachmentId}`);
      },
    );

    it.each(ALLOWED_CONTENT_TYPES)("accepts %s", async (contentType) => {
      expect((await upload(OWNER, { contentType })).ticket.kind).toBe("local-put");
    });

    it("accepts exactly 5 MB", async () => {
      expect(MAX_ATTACHMENT_BYTES).toBe(5 * MB);
      await expect(upload(OWNER, { size: 5 * MB })).resolves.toMatchObject({ ticket: { kind: "local-put" } });
    });

    it.each([
      ["6 MB", { size: 6 * MB }],
      ["one byte over", { size: 5 * MB + 1 }],
      ["an executable type", { contentType: "application/x-msdownload" }],
      ["an svg", { contentType: "image/svg+xml" }],
      ["a type with parameters", { contentType: "text/plain; charset=utf-8" }],
      ["zero bytes", { size: 0 }],
      ["a fractional size", { size: 10.5 }],
      ["no file name", { fileName: "   " }],
    ])("rejects %s with a validation error BEFORE any ticket exists", async (_label, input) => {
      await expect(upload(OWNER, input)).rejects.toBeInstanceOf(ValidationError);
      expect(storage.prepared).toEqual([]);
      expect(ctx.store.attachments.size).toBe(0);
    });

    it("refuses the guest role with Forbidden and a stranger with NotFound, issuing nothing", async () => {
      await expect(upload(GUEST)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(upload(STRANGER)).rejects.toBeInstanceOf(NotFoundError);
      await expect(upload(RIVAL)).rejects.toBeInstanceOf(NotFoundError);
      expect(storage.prepared).toEqual([]);
      expect(ctx.store.attachments.size).toBe(0);
    });

    it("limits a user to 20 requests an hour and a demo guest to 5 (REQ-SEC-03)", async () => {
      const limiter = new InMemoryRateLimiter(ctx.clock);
      const request = (who: typeof OWNER) => makeRequestUpload(ctx, { storage, limiter })(who, { taskId, fileName: "a.png", contentType: "image/png", size: 10 });
      for (let i = 0; i < 20; i++) await request(OWNER);
      const blocked = await request(OWNER).catch((e) => e);
      expect(blocked).toBeInstanceOf(RateLimitError);
      expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
      expect(ctx.store.attachments.size).toBe(20);
      // The guest user owns a sandbox board of their own.
      const sandbox = await seedKanban(ctx, GUEST_USER);
      const guestTask = await makeCreateTask(ctx)(GUEST_USER, { stageId: sandbox.todoId, title: "mine" });
      const guestRequest = () =>
        makeRequestUpload(ctx, { storage, limiter })(GUEST_USER, { taskId: guestTask.id, fileName: "a.png", contentType: "image/png", size: 10 });
      for (let i = 0; i < 5; i++) await guestRequest();
      await expect(guestRequest()).rejects.toBeInstanceOf(RateLimitError);
    });

    it("caps a demo guest at 5 attachments in total, counting recent pending uploads but not abandoned ones (REQ-ATT-06)", async () => {
      const sandbox = await seedKanban(ctx, GUEST_USER);
      const guestTask = await makeCreateTask(ctx)(GUEST_USER, { stageId: sandbox.todoId, title: "mine" });
      const request = () =>
        makeRequestUpload(ctx, { storage, limiter: new InMemoryRateLimiter(ctx.clock) })(GUEST_USER, { taskId: guestTask.id, fileName: "a.png", contentType: "image/png", size: 10 });
      const seed = (n: number, patch: Partial<Attachment>) => {
        for (let i = 0; i < n; i++) {
          const id = `seed-${patch.status}-${i}-${ctx.store.attachments.size}`;
          ctx.store.attachments.set(id, {
            id, commentId: null, boardId: sandbox.boardId, uploaderId: "guest-user", storageKey: `k-${id}`, fileName: "f.png",
            contentType: "image/png", size: 1, status: "pending", createdAt: ctx.clock.now(), ...patch,
          });
        }
      };
      seed(3, { status: "pending", createdAt: new Date(ctx.clock.now().getTime() - 2 * 3600_000) }); // abandoned: ignored
      seed(4, { status: "confirmed" });
      await request(); // 5th
      const error = await request().catch((e) => e);
      expect(error).toBeInstanceOf(ConflictError);
      expect(error.message).toMatch(/at most 5 attachments/);
      expect(storage.prepared).toHaveLength(1);
    });

    it("does not cap real accounts", async () => {
      for (let i = 0; i < 6; i++) {
        ctx.store.attachments.set(`c${i}`, {
          id: `c${i}`, commentId: null, boardId: k.boardId, uploaderId: "owner", storageKey: `k${i}`, fileName: "f.png",
          contentType: "image/png", size: 1, status: "confirmed", createdAt: ctx.clock.now(),
        });
      }
      await expect(upload(OWNER)).resolves.toMatchObject({ ticket: { kind: "local-put" } });
    });

    it("leaves no row behind when the storage cannot sign (StorageError, not a fake success)", async () => {
      storage.failing = true;
      await expect(upload(OWNER)).rejects.toBeInstanceOf(StorageError);
      expect(ctx.store.attachments.size).toBe(0);
    });
  });

  describe("createComment with attachments (REQ-CMT-01, REQ-CMT-02)", () => {
    it("confirms uploaded objects, links them to the new comment and records the size the storage reports", async () => {
      const row = await uploaded(OWNER, { size: 5000, actual: { size: 4321 } });
      const created = await comment(OWNER, { attachmentIds: [row.id] });
      expect(ctx.store.attachments.get(row.id)).toEqual({ ...row, commentId: created.id, size: 4321, status: "confirmed" });
      const [view] = await makeListComments(ctx, new InMemoryUserDirectory())(MEMBER, { taskId });
      expect(view!.attachments).toEqual([{ id: row.id, fileName: "photo.png", contentType: "image/png", size: 4321 }]);
    });

    it("takes up to five attachments", async () => {
      const rows = [];
      for (let i = 0; i < 5; i++) rows.push(await uploaded(MEMBER));
      await comment(MEMBER, { attachmentIds: rows.map((r) => r.id) });
      expect([...ctx.store.attachments.values()].filter((a) => a.status === "confirmed")).toHaveLength(5);
    });

    it("rejects a sixth attachment and creates nothing", async () => {
      const rows = [];
      for (let i = 0; i < 6; i++) rows.push(await uploaded(MEMBER));
      await expect(comment(MEMBER, { attachmentIds: rows.map((r) => r.id) })).rejects.toBeInstanceOf(ValidationError);
      expect(ctx.store.comments.size).toBe(0);
    });

    it.each([
      ["was never uploaded", async () => ctx.store.attachments.get((await upload(OWNER)).attachmentId)!],
      ["is larger than the size it was issued for", async () => uploaded(OWNER, { size: 100, actual: { size: 101 } })],
      ["has another content type", async () => uploaded(OWNER, { contentType: "image/png", actual: { contentType: "image/svg+xml" } })],
    ])("rejects an attachment that %s, keeping it pending and creating no comment", async (_label, prepare) => {
      const row = await prepare();
      const error = await comment(OWNER, { attachmentIds: [row.id] }).catch((e) => e);
      expect(error).toBeInstanceOf(ValidationError);
      expect(Object.keys(error.fieldErrors)).toEqual(["attachmentIds"]);
      expect(ctx.store.comments.size).toBe(0);
      expect(ctx.store.attachments.get(row.id)?.status).toBe("pending");
    });

    it("refuses the guest role, which may comment with text only (REQ-CMT-01)", async () => {
      const row = await uploaded(OWNER);
      await expect(comment(GUEST, { attachmentIds: [row.id] })).rejects.toBeInstanceOf(ForbiddenError);
      expect(ctx.store.comments.size).toBe(0);
    });

    it("answers NotFound for attachments that are unknown, someone else's, or from another board", async () => {
      const mine = await uploaded(OWNER);
      const theirs = await uploaded(MEMBER);
      const rival = await seedKanban(ctx, RIVAL);
      const rivalTask = await makeCreateTask(ctx)(RIVAL, { stageId: rival.todoId, title: "r" });
      const { attachmentId } = await makeRequestUpload(ctx, { storage, limiter: new InMemoryRateLimiter(ctx.clock) })(RIVAL, {
        taskId: rivalTask.id, fileName: "r.png", contentType: "image/png", size: 10,
      });
      const foreign = ctx.store.attachments.get(attachmentId)!;
      storage.upload(foreign.storageKey, 10, "image/png");
      for (const id of [theirs.id, foreign.id, "00000000-0000-4000-8000-0000000fffff"]) {
        await expect(comment(OWNER, { attachmentIds: [mine.id, id] })).rejects.toBeInstanceOf(NotFoundError);
      }
      expect(ctx.store.comments.size).toBe(0);
      expect(ctx.store.attachments.get(mine.id)?.status).toBe("pending");
    });

    it("does not let one upload be attached twice", async () => {
      const row = await uploaded(OWNER);
      await comment(OWNER, { attachmentIds: [row.id] });
      await expect(comment(OWNER, { attachmentIds: [row.id], body: "again" })).rejects.toBeInstanceOf(ConflictError);
      expect(ctx.store.comments.size).toBe(1);
    });

    it("treats a repeated id in one request as a single attachment", async () => {
      const row = await uploaded(OWNER);
      await comment(OWNER, { attachmentIds: [row.id, row.id] });
      expect(ctx.store.attachments.get(row.id)?.status).toBe("confirmed");
    });

    it("rolls the comment back when linking an attachment fails", async () => {
      const row = await uploaded(OWNER);
      const broken: TestContext = {
        ...ctx,
        uow: { run: (work) => ctx.uow.run((tx) => work({ ...tx, attachments: { ...tx.attachments, confirm: async () => { throw new Error("db down"); } } })) },
      };
      await expect(makeCreateComment(broken, { storage })(OWNER, { taskId, body: "x", attachmentIds: [row.id] })).rejects.toThrow("db down");
      expect(ctx.store.comments.size).toBe(0);
      expect(ctx.store.attachments.get(row.id)?.status).toBe("pending");
    });

    it("surfaces a storage outage as StorageError and creates nothing", async () => {
      const row = await uploaded(OWNER);
      storage.failing = true;
      await expect(comment(OWNER, { attachmentIds: [row.id] })).rejects.toBeInstanceOf(StorageError);
      expect(ctx.store.comments.size).toBe(0);
    });
  });

  describe("getAttachmentUrl (REQ-ATT-02, REQ-ATT-04)", () => {
    const url = (who: typeof OWNER, attachmentId: string) => makeGetAttachmentUrl(ctx, { storage })(who, { attachmentId });
    async function confirmed() {
      const row = await uploaded(OWNER, { size: 777 });
      await comment(OWNER, { attachmentIds: [row.id] });
      return ctx.store.attachments.get(row.id)!;
    }

    it("signs a short-lived URL for any member of the board, guest role included", async () => {
      const row = await confirmed();
      for (const who of [OWNER, MEMBER, GUEST]) {
        expect(await url(who, row.id)).toEqual({ url: `https://storage.test/get/${row.storageKey}?ttl=300`, fileName: "photo.png", contentType: "image/png", expiresInSeconds: 300 });
      }
      expect(storage.signed.every((s) => s.ttlSeconds <= 15 * 60)).toBe(true);
    });

    it("answers NotFound to strangers and rivals without signing anything, exactly like a missing id (REQ-ISO-08)", async () => {
      const row = await confirmed();
      const foreign = await url(STRANGER, row.id).catch((e) => e);
      const rival = await url(RIVAL, row.id).catch((e) => e);
      const missing = await url(OWNER, "00000000-0000-4000-8000-0000000fffff").catch((e) => e);
      expect(foreign).toBeInstanceOf(NotFoundError);
      expect(rival).toEqual(foreign);
      expect(missing).toEqual(foreign);
      expect(storage.signed).toEqual([]);
    });

    it("does not serve an upload that was never attached to a comment", async () => {
      const pending = await uploaded(OWNER);
      await expect(url(OWNER, pending.id)).rejects.toBeInstanceOf(NotFoundError);
      expect(storage.signed).toEqual([]);
    });

    it("raises StorageError when the storage cannot sign, never an empty URL", async () => {
      const row = await confirmed();
      storage.failing = true;
      await expect(url(OWNER, row.id)).rejects.toBeInstanceOf(StorageError);
    });
  });
});
