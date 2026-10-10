import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictError, ForbiddenError, NotFoundError, UnauthenticatedError } from "@/domain/errors";

const redirect = vi.fn((to: string) => {
  throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;replace;${to};307;` });
});
const notFound = vi.fn(() => {
  throw Object.assign(new Error("NEXT_NOT_FOUND"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
});
const revalidatePath = vi.fn();
vi.mock("next/navigation", () => ({ redirect, notFound }));
vi.mock("next/cache", () => ({ revalidatePath }));
const logger = { error: vi.fn() };
vi.mock("@/infrastructure/container", () => ({ getContainer: () => ({ logger }) }));

const { loadPage } = await import("@/app/_shared/load-page");
const { runMutation, text } = await import("@/app/_shared/run-mutation");
const { failureOf } = await import("@/app/_shared/mutation-state");

beforeEach(() => vi.clearAllMocks());

describe("loadPage", () => {
  it("returns the data on success", async () => {
    await expect(loadPage(async () => 42)).resolves.toBe(42);
  });

  it.each([new NotFoundError(), new ForbiddenError()])("renders the 404 page for %s, so existence never leaks", async (error) => {
    await expect(loadPage(async () => Promise.reject(error))).rejects.toMatchObject({ digest: expect.stringContaining("404") });
  });

  it("sends an expired session to the login page", async () => {
    await expect(loadPage(async () => Promise.reject(new UnauthenticatedError()))).rejects.toMatchObject({ digest: expect.stringContaining("/login") });
  });

  it("logs unexpected failures and raises a generic error without their detail", async () => {
    const cause = new Error("db exploded with secret");
    const error = await loadPage(async () => Promise.reject(cause)).catch((e: Error) => e);
    expect(error.message).toBe("Something went wrong");
    expect(logger.error).toHaveBeenCalledWith("page load failed", { error: cause });
  });
});

describe("runMutation", () => {
  it("revalidates the listed paths and reports success", async () => {
    await expect(runMutation(async () => "ok", { revalidate: ["/boards", "/boards/1"] })).resolves.toEqual({ ok: true, data: null });
    expect(revalidatePath.mock.calls.map(([path]) => path)).toEqual(["/boards", "/boards/1"]);
  });

  it("redirects after success to the destination computed from the result", async () => {
    await expect(runMutation(async () => ({ id: "b1" }), { redirectTo: (b) => `/boards/${b.id}` })).rejects.toMatchObject({ digest: expect.stringContaining("/boards/b1") });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("stays put when the destination callback returns null", async () => {
    await expect(runMutation(async () => "ok", { redirectTo: () => null })).resolves.toEqual({ ok: true, data: null });
    expect(redirect).not.toHaveBeenCalled();
  });

  it("returns typed failures without revalidating", async () => {
    const result = await runMutation(async () => Promise.reject(new ConflictError("Already a member")), { revalidate: ["/boards"] });
    expect(result).toEqual({ ok: false, code: "CONFLICT", message: "Already a member" });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("sends an unauthenticated caller to the login page", async () => {
    await expect(runMutation(async () => Promise.reject(new UnauthenticatedError()))).rejects.toMatchObject({ digest: expect.stringContaining("/login") });
  });

  it("logs unexpected errors and returns INTERNAL without detail", async () => {
    const cause = new Error("boom");
    const result = await runMutation(async () => Promise.reject(cause));
    expect(result).toEqual({ ok: false, code: "INTERNAL", message: "Something went wrong" });
    expect(logger.error).toHaveBeenCalledWith("action failed", { error: cause });
  });
});

describe("form helpers", () => {
  it("text() reads a string field and treats missing or file entries as empty", () => {
    const form = new FormData();
    form.set("name", "Roadmap");
    form.set("upload", new Blob(["x"]), "x.txt");
    expect([text(form, "name"), text(form, "missing"), text(form, "upload")]).toEqual(["Roadmap", "", ""]);
  });

  it("failureOf() extracts only failures from a form state", () => {
    expect(failureOf(undefined)).toBeUndefined();
    expect(failureOf({ ok: true, data: null })).toBeUndefined();
    expect(failureOf({ ok: false, code: "CONFLICT", message: "x" })).toMatchObject({ code: "CONFLICT" });
  });
});
