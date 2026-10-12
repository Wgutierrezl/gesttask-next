// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithIntl as render } from "@tests/support/render";
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
    await waitFor(() => expect(strategy.uploadFile).toHaveBeenCalledWith({ kind: "local-put", url: "http://x/put" }, expect.any(File), expect.any(AbortSignal)));
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

  it("refuses a file over the size limit on the spot, without asking the server for a ticket", async () => {
    const user = userEvent.setup();
    render(<CommentForm taskId="t1" canAttach demoGuest={false} />);
    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "huge.pdf", { type: "application/pdf" });
    await pick(user, big, png("small.png"));
    expect(await screen.findByText("huge.pdf: The file is larger than 5.0 MB")).toBeTruthy();
    expect(await screen.findByText("small.png: ready")).toBeTruthy();
    expect(uploads.requestUploadAction).toHaveBeenCalledTimes(1);
    expect(uploads.requestUploadAction).toHaveBeenCalledWith(expect.objectContaining({ fileName: "small.png" }));
  });

  it("announces a failed file once, through the live region, and a pending one as progress", async () => {
    let finish!: () => void;
    strategy.uploadFile.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
    const user = userEvent.setup({ applyAccept: false });
    render(<CommentForm taskId="t1" canAttach demoGuest={false} />);
    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "huge.pdf", { type: "application/pdf" });
    await pick(user, png(), big);
    expect(screen.getByText("pixel.png: uploading...").closest("li")?.getAttribute("aria-busy")).toBe("true");
    expect(screen.getByText("huge.pdf: The file is larger than 5.0 MB").closest("[aria-live]")).not.toBeNull();
    expect(screen.getAllByRole("alert").map((a) => a.textContent)).toEqual([""]); // only the form's own empty region: the file is announced once, by the live region
    finish();
    expect(await screen.findByText("pixel.png: ready")).toBeTruthy();
  });

  it("keeps the live region in the page while empty, and words the size limit the same in the help and the error", () => {
    render(<CommentForm taskId="t1" canAttach demoGuest={false} />);
    const region = document.querySelector("[aria-live=polite]");
    expect(region?.textContent).toBe("");
    expect(screen.getByText(/up to 5\.0 MB each and 5 per comment/)).toBeTruthy();
  });

  it("aborts the upload under way when its file is removed", async () => {
    let signal: AbortSignal | undefined;
    strategy.uploadFile.mockImplementation((_ticket: unknown, _file: File, s?: AbortSignal) => {
      signal = s;
      return new Promise<void>(() => {});
    });
    const user = userEvent.setup();
    render(<CommentForm taskId="t1" canAttach demoGuest={false} />);
    await pick(user, png());
    await waitFor(() => expect(signal).toBeDefined());
    expect(signal!.aborted).toBe(false);
    await user.click(screen.getByRole("button", { name: "Remove pixel.png" }));
    expect(signal!.aborted).toBe(true);
    expect(screen.queryByText(/pixel\.png/)).toBeNull();
  });

  it("cannot go past five files when the picker fires twice before React re-renders", async () => {
    render(<CommentForm taskId="t1" canAttach demoGuest={false} />);
    const input = screen.getByLabelText("Attach files");
    const three = (prefix: string) => Array.from({ length: 3 }, (_, i) => png(`${prefix}${i}.png`));
    fireEvent.change(input, { target: { files: three("a") } });
    fireEvent.change(input, { target: { files: three("b") } });
    await waitFor(() => expect(screen.getAllByText(/: ready$/)).toHaveLength(5));
    expect(uploads.requestUploadAction).toHaveBeenCalledTimes(5);
    expect(screen.getByText("b2.png: You can attach up to 5 files to a comment")).toBeTruthy();
  });

  describe("retrying a failed upload", () => {
    const ticket = { kind: "local-put", url: "http://x/put" };

    it("offers Retry after a storage failure and reuses the same ticket", async () => {
      strategy.uploadFile.mockRejectedValueOnce(new strategy.UploadError("The upload failed. Try again."));
      const user = userEvent.setup();
      render(<CommentForm taskId="t1" canAttach demoGuest={false} />);
      await pick(user, png());
      await screen.findByText("pixel.png: The upload failed. Try again.");
      await user.click(screen.getByRole("button", { name: "Retry pixel.png" }));
      expect(await screen.findByText("pixel.png: ready")).toBeTruthy();
      expect(uploads.requestUploadAction).toHaveBeenCalledTimes(1);
      expect(strategy.uploadFile).toHaveBeenLastCalledWith(ticket, expect.any(File), expect.any(AbortSignal));
      await user.type(screen.getByLabelText("Add a comment"), "x");
      await user.click(screen.getByRole("button", { name: "Comment" }));
      await waitFor(() => expect(comments.createCommentAction).toHaveBeenCalled());
      expect(fields(comments.createCommentAction.mock.calls[0]![1]).filter(([n]) => n === "attachmentIds")).toEqual([["attachmentIds", "att-1"]]);
    });

    it("asks for a fresh ticket when the reused one fails too", async () => {
      strategy.uploadFile.mockRejectedValueOnce(new strategy.UploadError("The upload failed. Try again.")).mockRejectedValueOnce(new strategy.UploadError("The upload failed. Try again."));
      const user = userEvent.setup();
      render(<CommentForm taskId="t1" canAttach demoGuest={false} />);
      await pick(user, png());
      await screen.findByText("pixel.png: The upload failed. Try again.");
      await user.click(screen.getByRole("button", { name: "Retry pixel.png" }));
      await waitFor(() => expect(strategy.uploadFile).toHaveBeenCalledTimes(2));
      await user.click(await screen.findByRole("button", { name: "Retry pixel.png" }));
      expect(await screen.findByText("pixel.png: ready")).toBeTruthy();
      expect(uploads.requestUploadAction).toHaveBeenCalledTimes(2);
    });

    it("asks again after a rate limit, but offers no Retry for a refusal that cannot change", async () => {
      uploads.requestUploadAction.mockResolvedValueOnce({ ok: false, code: "RATE_LIMITED", message: "Too many requests", retryAfterSeconds: 60 });
      const user = userEvent.setup();
      render(<CommentForm taskId="t1" canAttach demoGuest={false} />);
      await pick(user, png());
      await user.click(await screen.findByRole("button", { name: "Retry pixel.png" }));
      expect(await screen.findByText("pixel.png: ready")).toBeTruthy();
      expect(uploads.requestUploadAction).toHaveBeenCalledTimes(2);
      cleanup();
      uploads.requestUploadAction.mockResolvedValue({ ok: false, code: "CONFLICT", message: "Guest limit reached: at most 5 attachments. Sign up to attach more." });
      render(<CommentForm taskId="t1" canAttach demoGuest />);
      await pick(user, png("q.png"));
      expect(await screen.findByText(/q\.png: Guest limit reached.*Sign up to attach more/)).toBeTruthy();
      expect(screen.queryByRole("button", { name: /^Retry/ })).toBeNull();
    });
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

describe("attaching files in Spanish", () => {
  const es = { locale: "es" as const };
  const pickEs = async (user: ReturnType<typeof userEvent.setup>, ...files: File[]) => user.upload(screen.getByLabelText("Adjuntar archivos"), files);

  it("states the limits with localized sizes, and the demo quota only for demo sessions", () => {
    const { unmount } = render(<CommentForm taskId="t1" canAttach demoGuest={false} />, es);
    expect(screen.getByText("PNG, JPEG, WebP, PDF o texto plano, hasta 5,0 MB cada uno y 5 por comentario.")).toBeTruthy();
    unmount();
    render(<CommentForm taskId="t1" canAttach demoGuest />, es);
    expect(screen.getByText("PNG, JPEG, WebP, PDF o texto plano, hasta 5,0 MB cada uno y 5 por comentario. Las sesiones de demostración pueden adjuntar hasta 5 archivos en total.")).toBeTruthy();
  });

  it("reports each state, with Remove labelled by the file", async () => {
    let finish!: () => void;
    strategy.uploadFile.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
    const user = userEvent.setup();
    render(<CommentForm taskId="t1" canAttach demoGuest={false} />, es);
    await pickEs(user, png());
    expect(await screen.findByText("pixel.png: subiendo...")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Quitar pixel.png" }).textContent).toBe("Quitar");
    finish();
    expect(await screen.findByText("pixel.png: listo")).toBeTruthy();
  });

  it("explains the size and count limits in Spanish", async () => {
    const user = userEvent.setup();
    render(<CommentForm taskId="t1" canAttach demoGuest={false} />, es);
    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "huge.pdf", { type: "application/pdf" });
    await pickEs(user, big, ...Array.from({ length: 6 }, (_, i) => png(`f${i}.png`)));
    expect(await screen.findByText("huge.pdf: El archivo supera los 5,0 MB")).toBeTruthy();
    expect(await screen.findByText("f5.png: Puedes adjuntar hasta 5 archivos a un comentario")).toBeTruthy();
  });

  it.each([
    [{ ok: false, code: "RATE_LIMITED", message: "Too many requests", retryAfterSeconds: 180 }, "Demasiados intentos. Inténtalo de nuevo en 3 minutos."],
    [{ ok: false, code: "VALIDATION", message: "Invalid input", fieldErrors: {} }, "Se rechazó la subida."],
  ])("explains a refusal by the server in Spanish (%#)", async (refusal, text) => {
    uploads.requestUploadAction.mockResolvedValue(refusal);
    const user = userEvent.setup();
    render(<CommentForm taskId="t1" canAttach demoGuest={false} />, es);
    await pickEs(user, png());
    expect(await screen.findByText(`pixel.png: ${text}`)).toBeTruthy();
  });

  it("offers Retry in Spanish after a storage failure, and the failure text is Spanish too", async () => {
    strategy.uploadFile.mockRejectedValueOnce(new strategy.UploadError("The upload failed. Try again."));
    const user = userEvent.setup();
    render(<CommentForm taskId="t1" canAttach demoGuest={false} />, es);
    await pickEs(user, png());
    expect(await screen.findByText("pixel.png: La subida falló. Inténtalo de nuevo.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Reintentar pixel.png" }));
    expect(await screen.findByText("pixel.png: listo")).toBeTruthy();
  });
});
