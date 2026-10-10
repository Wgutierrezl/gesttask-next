import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/infrastructure/db/schema";
import { authFixture } from "../support/auth";
import { apiCaller, expectDocumented, expectError, signUpUser, type ApiUser } from "../support/api";
import { connectTestDb, resetDb } from "../support/db";

const request = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock("next/headers", () => ({ headers: async () => request.headers }));
vi.mock("@/infrastructure/container", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/infrastructure/container")>();
  const { testDatabaseUrl: url } = await import("../support/db");
  let container: ReturnType<typeof actual.buildContainer> | undefined;
  return {
    ...actual,
    getContainer: () =>
      (container ??= actual.buildContainer({
        DB_DRIVER: "pg",
        DATABASE_URL: url(),
        STORAGE_DRIVER: "local",
        BETTER_AUTH_SECRET: "integration-test-secret-0123456789abcdef",
        BETTER_AUTH_URL: "http://localhost:3000",
      })),
  };
});

const boardsRoute = await import("@/app/api/v1/boards/route");
const pipelinesRoute = await import("@/app/api/v1/boards/[boardId]/pipelines/route");
const stagesRoute = await import("@/app/api/v1/pipelines/[pipelineId]/stages/route");
const stageTasksRoute = await import("@/app/api/v1/stages/[stageId]/tasks/route");
const commentsRoute = await import("@/app/api/v1/tasks/[taskId]/comments/route");
const uploadsRoute = await import("@/app/api/v1/tasks/[taskId]/uploads/route");
const commentRoute = await import("@/app/api/v1/comments/[commentId]/route");
const downloadRoute = await import("@/app/api/v1/attachments/[attachmentId]/download/route");
const { getContainer } = await import("@/infrastructure/container");

const handle = connectTestDb();
const { auth } = authFixture(handle);
const call = apiCaller(request);
const MISSING = "00000000-0000-4000-8000-00000000ffff";
const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

let owner: ApiUser;
let member: ApiUser;
let viewer: ApiUser;
let rival: ApiUser;
let boardId: string;
let taskId: string;

const comment = async (who: ApiUser, body: object = {}) =>
  expectDocumented("createComment", await call(commentsRoute.POST, "POST", who, { params: { taskId }, body: { body: "Looks good", ...body } }));
const rows = () => handle.db.select().from(schema.comments);

/** Asks for a ticket through the API and sends the bytes like the browser does; resolves to the attachment id. */
async function uploadPng(who: ApiUser, id = taskId): Promise<string> {
  const ticket = await expectDocumented("requestUpload", await call(uploadsRoute.POST, "POST", who, { params: { taskId: id }, body: { fileName: "pixel.png", contentType: "image/png", size: PNG.byteLength } }));
  expect(ticket.ticket.kind).toBe("local-put");
  const sent = await getContainer().devStorageHandler!(new Request(ticket.ticket.url, { method: "PUT", headers: { "content-type": "image/png" }, body: new Blob([PNG]) }));
  expect(sent.status).toBe(204);
  return ticket.attachmentId;
}

beforeEach(async () => {
  await resetDb(handle);
  owner = await signUpUser(auth, "owner@example.com");
  member = await signUpUser(auth, "member@example.com");
  viewer = await signUpUser(auth, "viewer@example.com");
  rival = await signUpUser(auth, "rival@example.com");
  boardId = (await (await call(boardsRoute.POST, "POST", owner, { body: { name: "Roadmap" } })).json()).id;
  await handle.db.insert(schema.boardMembers).values([
    { boardId, userId: member.userId, role: "member" },
    { boardId, userId: viewer.userId, role: "guest" },
  ]);
  const pipelineId = (await (await call(pipelinesRoute.POST, "POST", owner, { params: { boardId }, body: { name: "Flow" } })).json()).id;
  const stageId = ((await (await call(stagesRoute.GET, "GET", owner, { params: { pipelineId } })).json()).items as { id: string }[])[0]!.id;
  taskId = (await (await call(stageTasksRoute.POST, "POST", owner, { params: { stageId }, body: { title: "Task" } })).json()).id;
});
afterAll(async () => {
  await getContainer().close();
  await handle.close();
});

describe("comments", () => {
  it("createComment takes the author from the session, never from the body", async () => {
    const created = await comment(member, { authorId: owner.userId });
    expect(created).toMatchObject({ taskId, boardId, authorId: member.userId, body: "Looks good" });
    await expectError(await call(commentsRoute.POST, "POST", member, { params: { taskId }, body: { body: "   " } }), 422, "VALIDATION");
    await expectError(await call(commentsRoute.POST, "POST", member, { params: { taskId }, body: { body: "x".repeat(2001) } }), 422, "VALIDATION");
  });

  it("the read-only role may comment with text, but not with files (403)", async () => {
    expect((await comment(viewer, { body: "Just text" })).authorId).toBe(viewer.userId);
    const attachmentId = await uploadPng(member);
    await expectError(await call(commentsRoute.POST, "POST", viewer, { params: { taskId }, body: { body: "With file", attachmentIds: [attachmentId] } }), 403, "FORBIDDEN");
    await expectError(await call(uploadsRoute.POST, "POST", viewer, { params: { taskId }, body: { fileName: "a.png", contentType: "image/png", size: 10 } }), 403, "FORBIDDEN");
  });

  it("listComments shows names and what you may manage, paginated, with attachment metadata and no storage key", async () => {
    await comment(member, { body: "first" });
    await comment(owner, { body: "second" });
    await comment(viewer, { body: "third" });
    const page = await expectDocumented("listComments", await call(commentsRoute.GET, "GET", member, { params: { taskId }, query: { limit: 2 } }));
    expect(page.items.map((c: { body: string; authorName: string; canManage: boolean }) => [c.body, c.authorName, c.canManage])).toEqual([["first", "member", true], ["second", "owner", false]]);
    const rest = await expectDocumented("listComments", await call(commentsRoute.GET, "GET", owner, { params: { taskId }, query: { limit: 2, cursor: page.nextCursor } }));
    expect(rest.items.map((c: { body: string; canManage: boolean }) => [c.body, c.canManage])).toEqual([["third", true]]); // the owner moderates everyone
  });

  it("editComment and deleteComment: your own, or any as the owner; a member cannot touch another's (403)", async () => {
    const mine = await comment(member, { body: "mine" });
    const edited = await expectDocumented("editComment", await call(commentRoute.PATCH, "PATCH", member, { params: { commentId: mine.id }, body: { body: "edited" } }));
    expect(edited.body).toBe("edited");
    await expectError(await call(commentRoute.PATCH, "PATCH", viewer, { params: { commentId: mine.id }, body: { body: "hijack" } }), 403, "FORBIDDEN");
    await expectError(await call(commentRoute.DELETE, "DELETE", viewer, { params: { commentId: mine.id } }), 403, "FORBIDDEN");
    await expectDocumented("deleteComment", await call(commentRoute.DELETE, "DELETE", owner, { params: { commentId: mine.id } }));
    expect(await rows()).toHaveLength(0);
  });
});

describe("attachments", () => {
  it("uploads through a ticket, links the file to a comment, downloads it, and deleting the comment queues the object", async () => {
    const attachmentId = await uploadPng(member);
    const created = await comment(member, { body: "With a file", attachmentIds: [attachmentId] });
    const listed = await expectDocumented("listComments", await call(commentsRoute.GET, "GET", viewer, { params: { taskId } }));
    expect(listed.items[0].attachments).toEqual([{ id: attachmentId, fileName: "pixel.png", contentType: "image/png", size: PNG.byteLength }]);

    const download = await expectDocumented("getAttachmentUrl", await call(downloadRoute.GET, "GET", viewer, { params: { attachmentId } }));
    expect(download).toMatchObject({ fileName: "pixel.png", contentType: "image/png" });
    const bytes = await getContainer().devStorageHandler!(new Request(download.url));
    expect(new Uint8Array(await bytes.arrayBuffer())).toEqual(PNG);

    await expectDocumented("deleteComment", await call(commentRoute.DELETE, "DELETE", member, { params: { commentId: created.id } }));
    const queued = (await handle.db.select().from(schema.storageDeletions)).map((r) => r.storageKey);
    expect(queued).toEqual([`boards/${boardId}/attachments/${attachmentId}`]);
  });

  it("requestUpload refuses files over 5 MB and types that are not allowed before issuing a ticket (422)", async () => {
    const big = await expectError(await call(uploadsRoute.POST, "POST", owner, { params: { taskId }, body: { fileName: "big.png", contentType: "image/png", size: 6 * 1024 * 1024 } }), 422, "VALIDATION");
    expect(big.error.details).toHaveProperty("size");
    const exe = await expectError(await call(uploadsRoute.POST, "POST", owner, { params: { taskId }, body: { fileName: "setup.exe", contentType: "application/x-msdownload", size: 10 } }), 422, "VALIDATION");
    expect(exe.error.details).toHaveProperty("contentType");
    expect(await handle.db.select().from(schema.attachments)).toHaveLength(0);
  });

  it("an upload that was never linked to a comment cannot be downloaded, and another user's upload cannot be linked", async () => {
    const pending = await uploadPng(member);
    await expectError(await call(downloadRoute.GET, "GET", member, { params: { attachmentId: pending } }), 404, "NOT_FOUND");
    await expectError(await call(commentsRoute.POST, "POST", owner, { params: { taskId }, body: { body: "Stolen", attachmentIds: [pending] } }), 404, "NOT_FOUND");
  });
});

describe("authentication and isolation (REQ-AUTH-04, REQ-ISO-01, REQ-ISO-06)", () => {
  const attempts = (target: { taskId: string; commentId: string; attachmentId: string }, who: ApiUser | null) =>
    [
      ["listComments", () => call(commentsRoute.GET, "GET", who, { params: { taskId: target.taskId } })],
      ["createComment", () => call(commentsRoute.POST, "POST", who, { params: { taskId: target.taskId }, body: { body: "x" } })],
      ["editComment", () => call(commentRoute.PATCH, "PATCH", who, { params: { commentId: target.commentId }, body: { body: "x" } })],
      ["deleteComment", () => call(commentRoute.DELETE, "DELETE", who, { params: { commentId: target.commentId } })],
      ["requestUpload", () => call(uploadsRoute.POST, "POST", who, { params: { taskId: target.taskId }, body: { fileName: "a.png", contentType: "image/png", size: 10 } })],
      ["getAttachmentUrl", () => call(downloadRoute.GET, "GET", who, { params: { attachmentId: target.attachmentId } })],
    ] as const;

  async function seeded() {
    const attachmentId = await uploadPng(owner);
    const created = await comment(owner, { body: "mine", attachmentIds: [attachmentId] });
    return { taskId, commentId: created.id as string, attachmentId };
  }

  it("every operation answers 401 without a session", async () => {
    for (const [name, run] of attempts(await seeded(), null)) {
      await expectError(await run(), 401, "UNAUTHENTICATED").catch((e: Error) => Promise.reject(new Error(`${name}: ${e.message}`)));
    }
  });

  it("a rival gets the same 404 for a foreign id as for a missing one on every operation, and nothing changes", async () => {
    const target = await seeded();
    const foreign = attempts(target, rival);
    const missing = attempts({ taskId: MISSING, commentId: MISSING, attachmentId: MISSING }, owner);
    for (const [index, [name, run]] of foreign.entries()) {
      const stranger = await expectError(await run(), 404, "NOT_FOUND").catch((e: Error) => Promise.reject(new Error(`${name}: ${e.message}`)));
      const absent = await expectError(await missing[index]![1](), 404, "NOT_FOUND");
      expect(stranger.error.message, name).toBe(absent.error.message); // REQ-ISO-08
    }
    const [stored] = await rows();
    expect(stored).toMatchObject({ body: "mine", authorId: owner.userId });
    expect(await handle.db.select().from(schema.storageDeletions)).toHaveLength(0);
  });
});
