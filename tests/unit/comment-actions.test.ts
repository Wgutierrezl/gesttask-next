import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictError, ForbiddenError, NotFoundError, RateLimitError, StorageError, ValidationError } from "@/domain/errors";

const redirect = vi.fn((to: string) => {
  throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;replace;${to};307;` });
});
const revalidatePath = vi.fn();
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("next/cache", () => ({ revalidatePath }));
const scheduleStorageCleanup = vi.fn();
vi.mock("@/app/_shared/storage-cleanup", () => ({ scheduleStorageCleanup }));
const useCases = { createComment: vi.fn(), editComment: vi.fn(), deleteComment: vi.fn(), requestUpload: vi.fn() };
vi.mock("@/infrastructure/container", () => ({ getContainer: () => ({ useCases, logger: { error: vi.fn() } }) }));

const comments = await import("@/app/_actions/comments");
const uploads = await import("@/app/_actions/uploads");
const TASK_PAGE = "/boards/[boardId]/pipelines/[pipelineId]/tasks/[taskId]";
const ID = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
const form = (entries: Record<string, string | string[]>) => {
  const data = new FormData();
  for (const [name, value] of Object.entries(entries)) for (const item of Array.isArray(value) ? value : [value]) data.append(name, item);
  return data;
};

beforeEach(() => {
  vi.clearAllMocks();
  for (const useCase of Object.values(useCases)) useCase.mockReset();
});

describe("createCommentAction", () => {
  it("posts the text with the attachments the browser finished uploading, and refreshes the task page", async () => {
    expect(await comments.createCommentAction(undefined, form({ taskId: ID(1), body: "Nice", attachmentIds: [ID(2), ID(3)] }))).toEqual({ ok: true, data: null });
    expect(useCases.createComment).toHaveBeenCalledWith({ taskId: ID(1), body: "Nice", attachmentIds: [ID(2), ID(3)] });
    expect(revalidatePath).toHaveBeenCalledWith(TASK_PAGE, "page");
  });

  it("sends no attachments when there are none (the no-JavaScript form)", async () => {
    await comments.createCommentAction(undefined, form({ taskId: ID(1), body: "Plain" }));
    expect(useCases.createComment).toHaveBeenCalledWith({ taskId: ID(1), body: "Plain", attachmentIds: [] });
  });

  it("ignores file entries in the form instead of passing them on", async () => {
    const data = form({ taskId: ID(1), body: "x" });
    data.append("attachmentIds", new File(["x"], "evil.txt"));
    await comments.createCommentAction(undefined, data);
    expect(useCases.createComment).toHaveBeenCalledWith({ taskId: ID(1), body: "x", attachmentIds: [] });
  });

  it.each([
    [new ValidationError("Invalid input", { body: ["Write something first"] }), { code: "VALIDATION", fieldErrors: { body: ["Write something first"] } }],
    [new ForbiddenError(), { code: "FORBIDDEN" }],
    [new NotFoundError(), { code: "NOT_FOUND" }],
    [new StorageError(), { code: "STORAGE" }],
  ])("returns %s as state and refreshes nothing", async (error, expected) => {
    useCases.createComment.mockRejectedValue(error);
    expect(await comments.createCommentAction(undefined, form({ taskId: ID(1), body: "" }))).toMatchObject({ ok: false, ...expected });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("editCommentAction", () => {
  it("sends the new text and refreshes the task page", async () => {
    expect(await comments.editCommentAction(undefined, form({ commentId: ID(4), body: "Edited" }))).toEqual({ ok: true, data: null });
    expect(useCases.editComment).toHaveBeenCalledWith({ commentId: ID(4), body: "Edited" });
    expect(revalidatePath).toHaveBeenCalledWith(TASK_PAGE, "page");
  });

  it("returns a refusal to edit someone else's comment as Forbidden", async () => {
    useCases.editComment.mockRejectedValue(new ForbiddenError());
    expect(await comments.editCommentAction(undefined, form({ commentId: ID(4), body: "x" }))).toMatchObject({ ok: false, code: "FORBIDDEN" });
  });
});

describe("deleteCommentAction", () => {
  it("needs the confirmation, server side too", async () => {
    expect(await comments.deleteCommentAction(undefined, form({ commentId: ID(4) }))).toMatchObject({ ok: false, code: "VALIDATION", fieldErrors: { confirm: [expect.any(String)] } });
    expect(useCases.deleteComment).not.toHaveBeenCalled();
  });

  it("deletes, refreshes the task page and queues the storage cleanup", async () => {
    expect(await comments.deleteCommentAction(undefined, form({ commentId: ID(4), confirm: "yes" }))).toEqual({ ok: true, data: null });
    expect(useCases.deleteComment).toHaveBeenCalledWith({ commentId: ID(4) });
    expect(revalidatePath).toHaveBeenCalledWith(TASK_PAGE, "page");
    expect(scheduleStorageCleanup).toHaveBeenCalledOnce();
  });

  it("queues no cleanup when the delete failed", async () => {
    useCases.deleteComment.mockRejectedValue(new NotFoundError());
    await comments.deleteCommentAction(undefined, form({ commentId: ID(4), confirm: "yes" }));
    expect(scheduleStorageCleanup).not.toHaveBeenCalled();
  });
});

describe("requestUploadAction", () => {
  const request = { taskId: ID(1), fileName: "a.png", contentType: "image/png", size: 10 };

  it("returns the ticket so the browser can upload straight to the storage", async () => {
    const result = { attachmentId: ID(2), ticket: { kind: "s3-post", url: "https://bucket.example", fields: { key: "k" } } };
    useCases.requestUpload.mockResolvedValue(result);
    expect(await uploads.requestUploadAction(request)).toEqual({ ok: true, data: result });
    expect(useCases.requestUpload).toHaveBeenCalledWith(request);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it.each([
    [new ValidationError("Invalid input", { size: ["Files can be at most 5 MB"] }), { code: "VALIDATION", fieldErrors: { size: ["Files can be at most 5 MB"] } }],
    [new ConflictError("Guest limit reached: at most 5 attachments. Sign up to attach more."), { code: "CONFLICT", message: expect.stringContaining("Sign up to attach more") }],
    [new RateLimitError(120), { code: "RATE_LIMITED", retryAfterSeconds: 120 }],
    [new ForbiddenError(), { code: "FORBIDDEN" }],
  ])("returns %s as a typed failure", async (error, expected) => {
    useCases.requestUpload.mockRejectedValue(error);
    expect(await uploads.requestUploadAction(request)).toMatchObject({ ok: false, ...expected });
  });

  it("sends a lost session to the login page", async () => {
    const { UnauthenticatedError } = await import("@/domain/errors");
    useCases.requestUpload.mockRejectedValue(new UnauthenticatedError());
    await expect(uploads.requestUploadAction(request)).rejects.toMatchObject({ digest: expect.stringContaining("/login") });
  });
});
