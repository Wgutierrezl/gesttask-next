import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SeededGuestSandbox, sandboxBoardId } from "@/infrastructure/auth/guest-sandbox";
import * as schema from "@/infrastructure/db/schema";
import { authFixture, cookieHeader } from "../support/auth";
import { connectTestDb, resetDb } from "../support/db";
import { drizzleDeps } from "../support/tx";

const request = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock("next/headers", () => ({ headers: async () => request.headers }));
const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath }));
const deferred = vi.hoisted(() => [] as (() => Promise<void>)[]);
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), after: (work: () => Promise<void>) => void deferred.push(work) }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;replace;${to};307;` });
  },
  notFound: () => {
    throw Object.assign(new Error("NEXT_NOT_FOUND"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
  },
}));
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

const comments = await import("@/app/_actions/comments");
const uploads = await import("@/app/_actions/uploads");
const { GET: download } = await import("@/app/api/attachments/[attachmentId]/download/route");
const { getContainer } = await import("@/infrastructure/container");

const handle = connectTestDb();
const { auth } = authFixture(handle);
const form = (entries: Record<string, string | string[]>) => {
  const data = new FormData();
  for (const [name, value] of Object.entries(entries)) for (const item of Array.isArray(value) ? value : [value]) data.append(name, item);
  return data;
};
const as = (headers: Headers) => void (request.headers = headers);
const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

async function guest() {
  const response = await auth.api.signInAnonymous({ returnHeaders: true });
  const user = { userId: response.response!.user.id, isGuest: true };
  const deps = drizzleDeps(handle);
  await new SeededGuestSandbox(handle.db, { uow: deps.uow, ids: { next: randomUUID }, clock: deps.clock }).provision(user);
  const boardId = sandboxBoardId(user.userId);
  // A task the demo seed left without comments, so each test starts from an empty thread.
  const [task] = await handle.db.select().from(schema.tasks).where(and(eq(schema.tasks.boardId, boardId), eq(schema.tasks.title, "Prepare onboarding checklist")));
  return { headers: cookieHeader(response.headers), boardId, userId: user.userId, taskId: task!.id };
}

/** An account that belongs to `boardId` with the given role. */
async function memberOf(boardId: string, role: "member" | "guest", email: string) {
  const response = await auth.api.signUpEmail({ body: { email, password: "correct horse battery", name: email.split("@")[0]! }, returnHeaders: true });
  await handle.db.insert(schema.boardMembers).values({ boardId, userId: response.response.user.id, role });
  return { headers: cookieHeader(response.headers), userId: response.response.user.id };
}

const commentRows = (taskId: string) => handle.db.select().from(schema.comments).where(eq(schema.comments.taskId, taskId));
const queuedKeys = async () => (await handle.db.select().from(schema.storageDeletions)).map((r) => r.storageKey);
const devStorage = () => getContainer().devStorageHandler!;

/** Asks for a ticket as the signed-in user and sends the bytes like the browser does; resolves to the attachment id. */
async function uploadPng(taskId: string): Promise<string> {
  const result = await uploads.requestUploadAction({ taskId, fileName: "pixel.png", contentType: "image/png", size: PNG.byteLength });
  if (!result.ok || result.data.ticket.kind !== "local-put") throw new Error(`upload not issued: ${JSON.stringify(result)}`);
  const sent = await devStorage()(new Request(result.data.ticket.url, { method: "PUT", headers: { "content-type": "image/png" }, body: new Blob([PNG]) }));
  expect(sent.status).toBe(204);
  return result.data.attachmentId;
}

beforeEach(async () => {
  await resetDb(handle);
  as(new Headers());
  revalidatePath.mockClear();
  deferred.length = 0;
});
afterAll(async () => {
  await getContainer().close();
  await handle.close();
});

describe("comment actions on Postgres", () => {
  it("comments, edits and deletes as the signed-in user; the author comes from the session", async () => {
    const g = await guest();
    as(g.headers);
    expect(await comments.createCommentAction(undefined, form({ taskId: g.taskId, body: "First!", authorId: "someone-else" }))).toEqual({ ok: true, data: null });
    const [created] = await commentRows(g.taskId);
    expect(created).toMatchObject({ body: "First!", authorId: g.userId, boardId: g.boardId });

    expect(await comments.editCommentAction(undefined, form({ commentId: created!.id, body: "Edited" }))).toEqual({ ok: true, data: null });
    expect((await commentRows(g.taskId))[0]?.body).toBe("Edited");

    expect(await comments.deleteCommentAction(undefined, form({ commentId: created!.id }))).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(await commentRows(g.taskId)).toHaveLength(1);
    expect(await comments.deleteCommentAction(undefined, form({ commentId: created!.id, confirm: "yes" }))).toEqual({ ok: true, data: null });
    expect(await commentRows(g.taskId)).toHaveLength(0);
  });

  it("attaches a file end to end: ticket, direct upload, confirm, download, then delete removes the object", async () => {
    const g = await guest();
    as(g.headers);
    const attachmentId = await uploadPng(g.taskId);
    expect(await comments.createCommentAction(undefined, form({ taskId: g.taskId, body: "With a file", attachmentIds: [attachmentId] }))).toEqual({ ok: true, data: null });

    const [row] = await handle.db.select().from(schema.attachments);
    expect(row).toMatchObject({ id: attachmentId, status: "confirmed", size: PNG.byteLength, contentType: "image/png", fileName: "pixel.png", uploaderId: g.userId });
    expect(row!.storageKey).toBe(`boards/${g.boardId}/attachments/${attachmentId}`);

    // The link in the UI: the app checks the session, then redirects to a signed URL that serves the bytes.
    const link = await download(new Request("http://localhost/download"), { params: Promise.resolve({ attachmentId }) });
    expect(link.status).toBe(302);
    const url = link.headers.get("location")!;
    expect(new Uint8Array(await (await devStorage()(new Request(url))).arrayBuffer())).toEqual(PNG);

    const [comment] = await commentRows(g.taskId);
    await comments.deleteCommentAction(undefined, form({ commentId: comment!.id, confirm: "yes" }));
    expect(await queuedKeys()).toEqual([row!.storageKey]);
    expect(deferred).toHaveLength(1);
    await deferred[0]!(); // what Next runs after the response
    expect(await queuedKeys()).toEqual([]);
    expect((await devStorage()(new Request(url))).status).toBe(404);
  });

  it("answers NotFound to another user for every comment and attachment operation, changing nothing", async () => {
    const [owner, stranger] = [await guest(), await guest()];
    as(owner.headers);
    const attachmentId = await uploadPng(owner.taskId);
    await comments.createCommentAction(undefined, form({ taskId: owner.taskId, body: "Private", attachmentIds: [attachmentId] }));
    const [comment] = await commentRows(owner.taskId);

    as(stranger.headers);
    const refused = [
      await comments.createCommentAction(undefined, form({ taskId: owner.taskId, body: "intruder" })),
      await comments.editCommentAction(undefined, form({ commentId: comment!.id, body: "pwned" })),
      await comments.deleteCommentAction(undefined, form({ commentId: comment!.id, confirm: "yes" })),
      await uploads.requestUploadAction({ taskId: owner.taskId, fileName: "x.png", contentType: "image/png", size: 8 }),
    ];
    for (const result of refused) expect(result).toMatchObject({ ok: false, code: "NOT_FOUND", message: "Resource not found" });
    const link = await download(new Request("http://localhost/download"), { params: Promise.resolve({ attachmentId }) });
    expect(link.status).toBe(404);
    expect(link.headers.get("location")).toBeNull();
    as(new Headers());
    expect((await download(new Request("http://localhost/download"), { params: Promise.resolve({ attachmentId }) })).status).toBe(401);
    expect((await commentRows(owner.taskId)).map((c) => c.body)).toEqual(["Private"]);
    expect(await queuedKeys()).toEqual([]);
  });

  it("lets a guest-role member comment with text, forbids attachments and other people's comments", async () => {
    const owner = await guest();
    const viewer = await memberOf(owner.boardId, "guest", "viewer@example.com");
    as(owner.headers);
    await comments.createCommentAction(undefined, form({ taskId: owner.taskId, body: "From the owner" }));
    const [ownersComment] = await commentRows(owner.taskId);

    as(viewer.headers);
    expect(await comments.createCommentAction(undefined, form({ taskId: owner.taskId, body: "From the viewer" }))).toEqual({ ok: true, data: null });
    expect(await uploads.requestUploadAction({ taskId: owner.taskId, fileName: "x.png", contentType: "image/png", size: 8 })).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(await comments.editCommentAction(undefined, form({ commentId: ownersComment!.id, body: "hijack" }))).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(await comments.deleteCommentAction(undefined, form({ commentId: ownersComment!.id, confirm: "yes" }))).toMatchObject({ ok: false, code: "FORBIDDEN" });
    const mine = (await commentRows(owner.taskId)).find((c) => c.authorId === viewer.userId)!;
    expect(await comments.editCommentAction(undefined, form({ commentId: mine.id, body: "Edited by me" }))).toEqual({ ok: true, data: null });
    expect((await commentRows(owner.taskId)).map((c) => c.body).sort()).toEqual(["Edited by me", "From the owner"]);
  });

  it("sends every comment action to the login page without a session", async () => {
    const g = await guest();
    as(new Headers());
    const digests = await Promise.all(
      [
        () => comments.createCommentAction(undefined, form({ taskId: g.taskId, body: "x" })),
        () => comments.editCommentAction(undefined, form({ commentId: randomUUID(), body: "x" })),
        () => comments.deleteCommentAction(undefined, form({ commentId: randomUUID(), confirm: "yes" })),
        () => uploads.requestUploadAction({ taskId: g.taskId, fileName: "x.png", contentType: "image/png", size: 8 }),
      ].map((attempt) => attempt().then(() => "", (e: { digest?: string }) => e.digest ?? String(e))),
    );
    for (const digest of digests) expect(digest).toContain("/login");
    expect(deferred).toHaveLength(0);
  });
});
