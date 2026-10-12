// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { renderWithIntl as render } from "@tests/support/render";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({ createCommentAction: vi.fn(), editCommentAction: vi.fn(), deleteCommentAction: vi.fn() }));
vi.mock("@/app/_actions/comments", () => actions);

const { formatBytes } = await import("@/components/comments/format");
const { CommentItem } = await import("@/components/comments/comment-item");
const { CommentForm } = await import("@/components/comments/comment-form");
const { CommentsSection } = await import("@/components/comments/comments-section");

const fields = (form: FormData) => Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
const row = (over: Record<string, unknown> = {}) => ({
  id: "c1", authorName: "Olivia Owner", body: "Looks good to me", createdAt: "2026-10-09T10:00:00.000Z", canManage: false, attachments: [], ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  for (const action of Object.values(actions)) action.mockResolvedValue({ ok: true, data: null });
});
afterEach(cleanup);

describe("formatBytes", () => {
  it.each([[0, "0 B"], [1023, "1023 B"], [1024, "1.0 KB"], [1536, "1.5 KB"], [5 * 1024 * 1024, "5.0 MB"], [1024 * 1024 - 1, "1024.0 KB"]])("%i bytes read %s", (bytes, text) => {
    expect(formatBytes(bytes, "en")).toBe(text);
  });

  it.each([[0, "0 B"], [1023, "1023 B"], [1536, "1,5 KB"], [5 * 1024 * 1024, "5,0 MB"], [1024 * 1024 - 1, "1024,0 KB"]])("%i bytes read %s in Spanish", (bytes, text) => {
    expect(formatBytes(bytes, "es")).toBe(text);
  });
});

describe("CommentItem", () => {
  it("shows who wrote it, when, and the text exactly as typed", () => {
    render(<CommentItem comment={row({ body: "line one\nline two" })} />);
    const article = screen.getByRole("article");
    expect(within(article).getByText("Olivia Owner")).toBeTruthy();
    expect(article.querySelector("time")?.getAttribute("datetime")).toBe("2026-10-09T10:00:00.000Z");
    expect(article.textContent).toContain("line one\nline two");
  });

  it("renders user text as text: markup in a comment is shown, never run", () => {
    render(<CommentItem comment={row({ body: '<img src=x onerror="alert(1)"><b>bold</b>' })} />);
    const article = screen.getByRole("article");
    expect(article.querySelector("img")).toBeNull();
    expect(article.querySelector("b")).toBeNull();
    expect(article.textContent).toContain('<img src=x onerror="alert(1)"><b>bold</b>');
  });

  it("names a deleted author as the use case reports it", () => {
    render(<CommentItem comment={row({ authorName: "Deleted user" })} />);
    expect(screen.getByText("Deleted user")).toBeTruthy();
  });

  it("links each attachment to the authorized download route with its size, not to the storage", () => {
    render(<CommentItem comment={row({ attachments: [{ id: "a1", fileName: "cat.png", contentType: "image/png", size: 2048 }, { id: "a2", fileName: "notes.pdf", contentType: "application/pdf", size: 3 * 1024 * 1024 }] })} />);
    const links = screen.getAllByRole("link");
    expect(links.map((l) => [l.textContent, l.getAttribute("href")])).toEqual([
      ["cat.png", "/api/attachments/a1/download"],
      ["notes.pdf", "/api/attachments/a2/download"],
    ]);
    expect(screen.getByText("(2.0 KB)")).toBeTruthy();
    expect(screen.getByText("(3.0 MB)")).toBeTruthy();
  });

  it("offers no edit or delete to someone who may not change it", () => {
    render(<CommentItem comment={row({ canManage: false })} />);
    expect(screen.queryByText("Edit")).toBeNull();
    expect(screen.queryByText("Delete")).toBeNull();
  });

  it("edits with the current text prefilled and sends the comment id", async () => {
    const user = userEvent.setup();
    render(<CommentItem comment={row({ canManage: true })} />);
    await user.click(screen.getByText("Edit"));
    const box = screen.getByLabelText("Edit comment") as HTMLTextAreaElement;
    expect(box.value).toBe("Looks good to me");
    await user.clear(box);
    await user.type(box, "Actually, great");
    await user.click(screen.getByRole("button", { name: "Save comment" }));
    await waitFor(() => expect(actions.editCommentAction).toHaveBeenCalled());
    expect(fields(actions.editCommentAction.mock.calls[0]![1])).toEqual({ commentId: "c1", body: "Actually, great" });
  });

  it("deletes only after the confirmation box is ticked", async () => {
    const user = userEvent.setup();
    render(<CommentItem comment={row({ canManage: true })} />);
    await user.click(screen.getByText("Delete"));
    const confirm = screen.getByLabelText("I want to delete this comment") as HTMLInputElement;
    expect(confirm.required).toBe(true);
    await user.click(confirm);
    await user.click(screen.getByRole("button", { name: "Delete comment" }));
    await waitFor(() => expect(actions.deleteCommentAction).toHaveBeenCalled());
    expect(fields(actions.deleteCommentAction.mock.calls[0]![1])).toEqual({ commentId: "c1", confirm: "yes" });
  });

  it("shows a refusal from the server next to the form", async () => {
    actions.editCommentAction.mockResolvedValue({ ok: false, code: "FORBIDDEN", message: "Insufficient permissions" });
    const user = userEvent.setup();
    render(<CommentItem comment={row({ canManage: true })} />);
    await user.click(screen.getByText("Edit"));
    await user.click(screen.getByRole("button", { name: "Save comment" }));
    expect((await screen.findAllByRole("alert")).map((a) => a.textContent)).toContain("Insufficient permissions");
  });
});

describe("CommentForm", () => {
  it("posts the text for the task", async () => {
    const user = userEvent.setup();
    render(<CommentForm taskId="t1" canAttach demoGuest={false} />);
    await user.type(screen.getByLabelText("Add a comment"), "Ship it");
    await user.click(screen.getByRole("button", { name: "Comment" }));
    await waitFor(() => expect(actions.createCommentAction).toHaveBeenCalled());
    expect(fields(actions.createCommentAction.mock.calls[0]![1])).toEqual({ taskId: "t1", body: "Ship it" });
  });

  it("limits the text to 2000 characters in the browser too", () => {
    render(<CommentForm taskId="t1" canAttach demoGuest={false} />);
    expect((screen.getByLabelText("Add a comment") as HTMLTextAreaElement).maxLength).toBe(2000);
  });

  it("links a validation error to the box", async () => {
    actions.createCommentAction.mockResolvedValue({ ok: false, code: "VALIDATION", message: "Invalid input", fieldErrors: { body: ["Write something first"] } });
    const user = userEvent.setup();
    render(<CommentForm taskId="t1" canAttach demoGuest={false} />);
    await user.type(screen.getByLabelText("Add a comment"), " ");
    await user.click(screen.getByRole("button", { name: "Comment" }));
    expect(await screen.findByText("Write something first")).toBeTruthy();
    expect(screen.getByLabelText("Add a comment").getAttribute("aria-invalid")).toBe("true");
  });
});

describe("CommentsSection", () => {
  it("lists the comments oldest first under a heading and offers the form", () => {
    render(<CommentsSection taskId="t1" comments={[row({ id: "a", body: "first" }), row({ id: "b", body: "second", authorName: "Marco" })]} truncated={false} canAttach demoGuest={false} />);
    expect(screen.getByRole("heading", { name: "Comments (2)" })).toBeTruthy();
    expect(screen.getAllByRole("article").map((a) => a.textContent)).toEqual([expect.stringContaining("first"), expect.stringContaining("second")]);
    expect(screen.getByLabelText("Add a comment")).toBeTruthy();
  });

  it("says so when there are none", () => {
    render(<CommentsSection taskId="t1" comments={[]} truncated={false} canAttach demoGuest={false} />);
    expect(screen.getByText("No comments yet.")).toBeTruthy();
    expect(screen.queryAllByRole("article")).toEqual([]);
  });

  it("says when older or newer comments are left out of the page", () => {
    render(<CommentsSection taskId="t1" comments={[row()]} truncated canAttach demoGuest={false} />);
    expect(screen.getByRole("status").textContent).toMatch(/first 200 comments/i);
  });
});

describe("validation failures are announced", () => {
  it("names the problem in one alert for a new comment and for an edited one", async () => {
    actions.createCommentAction.mockResolvedValue({ ok: false, code: "VALIDATION", message: "Invalid input", fieldErrors: { body: ["Write something first"] } });
    actions.editCommentAction.mockResolvedValue({ ok: false, code: "VALIDATION", message: "Invalid input", fieldErrors: { body: ["Too long"] } });
    const user = userEvent.setup();
    render(<CommentForm taskId="t1" canAttach={false} demoGuest={false} />);
    await user.type(screen.getByLabelText("Add a comment"), "x");
    await user.click(screen.getByRole("button", { name: "Comment" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Please fix the highlighted fields.");
    expect(screen.getByText("Write something first").id).toBe(screen.getByLabelText("Add a comment").getAttribute("aria-describedby"));
    cleanup();
    render(<CommentItem comment={row({ canManage: true })} />);
    await user.click(screen.getByRole("button", { name: "Save comment" }));
    expect((await screen.findAllByRole("alert")).map((a) => a.textContent)).toContain("Please fix the highlighted fields.");
  });
});

describe("comments in Spanish", () => {
  const es = { locale: "es" as const };

  it("translates the comment card, its attachments and the Edit and Delete disclosures; the text stays as written", () => {
    const attachments = [{ id: "a1", fileName: "cat.png", contentType: "image/png", size: 1536 }];
    render(<CommentItem comment={row({ canManage: true, attachments })} />, es);
    const article = screen.getByRole("article", { name: "Comentario de Olivia Owner" });
    expect(article.querySelector("time")?.textContent).toMatch(/^Publicado 9 oct 2026, /);
    expect(within(article).getByRole("list", { name: "Adjuntos" })).toBeTruthy();
    expect(within(article).getByText("(1,5 KB)")).toBeTruthy();
    expect(article.querySelector("p")?.textContent).toBe("Looks good to me");
    expect(within(article).getByText("Editar")).toBeTruthy();
    expect(within(article).getByText("Eliminar")).toBeTruthy();
  });

  it("edits and deletes with Spanish labels", async () => {
    const user = userEvent.setup();
    render(<CommentItem comment={row({ canManage: true })} />, es);
    await user.click(screen.getByText("Editar"));
    await user.click(screen.getByRole("button", { name: "Guardar comentario" }));
    await waitFor(() => expect(actions.editCommentAction).toHaveBeenCalled());
    expect(fields(actions.editCommentAction.mock.calls[0]![1])).toEqual({ commentId: "c1", body: "Looks good to me" });
    await user.click(screen.getByText("Eliminar"));
    await user.click(screen.getByLabelText("Quiero eliminar este comentario"));
    await user.click(screen.getByRole("button", { name: "Eliminar comentario" }));
    await waitFor(() => expect(actions.deleteCommentAction).toHaveBeenCalled());
    expect(screen.getByLabelText("Editar comentario")).toBeTruthy();
  });

  it("counts, warns about truncation, says when empty and explains why guests cannot attach", () => {
    const { rerender } = render(<CommentsSection taskId="t1" comments={[]} truncated canAttach={false} demoGuest={false} />, es);
    expect(screen.getByRole("heading", { name: "Comentarios (0)" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("Se muestran los primeros 200 comentarios de esta tarea.");
    expect(screen.getByText("Aún no hay comentarios.")).toBeTruthy();
    expect(screen.getByText("Los invitados pueden comentar, pero solo los miembros pueden adjuntar archivos.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Comentar" })).toBeTruthy();
    rerender(<CommentsSection taskId="t1" comments={[row()]} truncated={false} canAttach demoGuest={false} />);
    expect(screen.getByRole("heading", { name: "Comentarios (1)" })).toBeTruthy();
    expect(screen.queryByText("Aún no hay comentarios.")).toBeNull();
  });
});
