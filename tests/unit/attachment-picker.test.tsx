// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const comments = vi.hoisted(() => ({ createCommentAction: vi.fn(), editCommentAction: vi.fn(), deleteCommentAction: vi.fn() }));
const uploads = vi.hoisted(() => ({ requestUploadAction: vi.fn() }));
const strategy = vi.hoisted(() => ({ uploadFile: vi.fn(), UploadError: class UploadError extends Error {} }));
vi.mock("@/app/_actions/comments", () => comments);
vi.mock("@/app/_actions/uploads", () => uploads);
vi.mock("@/components/comments/upload-strategy", () => strategy);

const { CommentForm } = await import("@/components/comments/comment-form");

const png = (name = "pixel.png", type = "image/png") => new File([new Uint8Array([1, 2, 3, 4])], name, { type });
const fields = (form: FormData) => [...form.entries()].map(([k, v]) => [k, String(v)]);
let issued = 0;

beforeEach(() => {
  vi.clearAllMocks();
  issued = 0;
  comments.createCommentAction.mockResolvedValue({ ok: true, data: null });
  uploads.requestUploadAction.mockImplementation(async () => ({ ok: true, data: { attachmentId: `att-${++issued}`, ticket: { kind: "local-put", url: "http://x/put" } } }));
  strategy.uploadFile.mockResolvedValue(undefined);
});
afterEach(cleanup);

const pick = async (user: ReturnType<typeof userEvent.setup>, ...files: File[]) => user.upload(screen.getByLabelText("Attach files"), files);

describe("attaching files to a comment", () => {
  it("asks the server for a ticket describing the file, uploads straight to the storage, and sends the attachment id with the comment", async () => {
    const user = userEvent.setup();
    render(<CommentForm taskId="t1" canAttach demoGuest={false} />);
    await pick(user, png());
    expect(uploads.requestUploadAction).toHaveBeenCalledWith({ taskId: "t1", fileName: "pixel.png", contentType: "image/png", size: 4 });
    await waitFor(() => expect(strategy.uploadFile).toHaveBeenCalledWith({ kind: "local-put", url: "http://x/put" }, expect.any(File)));
    expect(await screen.findByText("pixel.png: ready")).toBeTruthy();
    await user.type(screen.getByLabelText("Add a comment"), "With a file");
    await user.click(screen.getByRole("button", { name: "Comment" }));
    await waitFor(() => expect(comments.createCommentAction).toHaveBeenCalled());
    expect(fields(comments.createCommentAction.mock.calls[0]![1]).sort()).toEqual([["attachmentIds", "att-1"], ["body", "With a file"], ["taskId", "t1"]]);
  });

  it("holds the Comment button until every upload has finished", async () => {
    let finish!: () => void;
    strategy.uploadFile.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
    const user = userEvent.setup();
    render(<CommentForm taskId="t1" canAttach demoGuest={false} />);
    await pick(user, png());
    expect(await screen.findByText("pixel.png: uploading...")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Comment" }) as HTMLButtonElement).disabled).toBe(true);
    finish();
    expect(await screen.findByText("pixel.png: ready")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Comment" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("shows why the server refused a file and sends nothing for it", async () => {
    uploads.requestUploadAction.mockResolvedValue({ ok: false, code: "VALIDATION", message: "Invalid input", fieldErrors: { contentType: ["This file type is not allowed"] } });
    const user = userEvent.setup({ applyAccept: false }); // the browser dialog filters by type; the server must hold the line anyway
    render(<CommentForm taskId="t1" canAttach demoGuest={false} />);
    await pick(user, png("run.exe", "application/x-msdownload"));
    expect(await screen.findByText("run.exe: This file type is not allowed")).toBeTruthy();
    expect(strategy.uploadFile).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText("Add a comment"), "text only");
    await user.click(screen.getByRole("button", { name: "Comment" }));
    await waitFor(() => expect(comments.createCommentAction).toHaveBeenCalled());
    expect(fields(comments.createCommentAction.mock.calls[0]![1]).some(([name]) => name === "attachmentIds")).toBe(false);
  });

  it("surfaces the demo guest limit in readable words", async () => {
    uploads.requestUploadAction.mockResolvedValue({ ok: false, code: "CONFLICT", message: "Guest limit reached: at most 5 attachments. Sign up to attach more." });
    const user = userEvent.setup();
    render(<CommentForm taskId="t1" canAttach demoGuest />);
    await pick(user, png());
    expect(await screen.findByText(/Sign up to attach more/)).toBeTruthy();
  });

  it("reports a rate limit with the wait", async () => {
    uploads.requestUploadAction.mockResolvedValue({ ok: false, code: "RATE_LIMITED", message: "Too many requests", retryAfterSeconds: 180 });
    const user = userEvent.setup();
    render(<CommentForm taskId="t1" canAttach demoGuest={false} />);
    await pick(user, png());
    expect(await screen.findByText(/Try again in 3 minutes/)).toBeTruthy();
  });

  it("a storage failure drops the file instead of attaching something that never arrived", async () => {
    strategy.uploadFile.mockRejectedValue(new strategy.UploadError("The upload failed. Try again."));
    const user = userEvent.setup();
    render(<CommentForm taskId="t1" canAttach demoGuest={false} />);
    await pick(user, png());
    expect(await screen.findByText("pixel.png: The upload failed. Try again.")).toBeTruthy();
    await user.type(screen.getByLabelText("Add a comment"), "x");
    await user.click(screen.getByRole("button", { name: "Comment" }));
    await waitFor(() => expect(comments.createCommentAction).toHaveBeenCalled());
    expect(fields(comments.createCommentAction.mock.calls[0]![1]).some(([name]) => name === "attachmentIds")).toBe(false);
  });

  it("lets the visitor remove a file before posting", async () => {
    const user = userEvent.setup();
    render(<CommentForm taskId="t1" canAttach demoGuest={false} />);
    await pick(user, png("a.png"), png("b.png"));
    expect(await screen.findByText("b.png: ready")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Remove a.png" }));
    await user.type(screen.getByLabelText("Add a comment"), "one file");
    await user.click(screen.getByRole("button", { name: "Comment" }));
    await waitFor(() => expect(comments.createCommentAction).toHaveBeenCalled());
    expect(fields(comments.createCommentAction.mock.calls[0]![1]).filter(([name]) => name === "attachmentIds")).toEqual([["attachmentIds", "att-2"]]);
  });

  it("stops at five files per comment without asking the server for a sixth ticket", async () => {
    const user = userEvent.setup();
    render(<CommentForm taskId="t1" canAttach demoGuest={false} />);
    await pick(user, ...Array.from({ length: 6 }, (_, i) => png(`f${i}.png`)));
    await waitFor(() => expect(screen.getAllByText(/: ready$/)).toHaveLength(5));
    expect(uploads.requestUploadAction).toHaveBeenCalledTimes(5);
    expect(screen.getByText("f5.png: You can attach up to 5 files to a comment")).toBeTruthy();
  });

  it("starts clean after the comment is posted", async () => {
    const user = userEvent.setup();
    render(<CommentForm taskId="t1" canAttach demoGuest={false} />);
    await pick(user, png());
    expect(await screen.findByText("pixel.png: ready")).toBeTruthy();
    await user.type(screen.getByLabelText("Add a comment"), "posted");
    await user.click(screen.getByRole("button", { name: "Comment" }));
    await waitFor(() => expect(screen.queryByText("pixel.png: ready")).toBeNull());
    expect((screen.getByLabelText("Add a comment") as HTMLTextAreaElement).value).toBe("");
  });

  it("explains the demo limits to demo guests", () => {
    render(<CommentForm taskId="t1" canAttach demoGuest />);
    expect(screen.getByText(/Demo sessions can attach up to 5 files in total/)).toBeTruthy();
  });

  it("offers no file picker to read-only guests, and says why", () => {
    render(<CommentForm taskId="t1" canAttach={false} demoGuest={false} />);
    expect(screen.queryByLabelText("Attach files")).toBeNull();
    expect(screen.getByText("Guests can comment, but only members can attach files.")).toBeTruthy();
  });

  it("limits what the file dialog offers to the allowed types", () => {
    render(<CommentForm taskId="t1" canAttach demoGuest={false} />);
    expect((screen.getByLabelText("Attach files") as HTMLInputElement).accept).toBe("image/png,image/jpeg,image/webp,application/pdf,text/plain");
  });
});
