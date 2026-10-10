import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictError, RateLimitError, ValidationError } from "@/domain/errors";

const redirect = vi.fn((to: string) => {
  throw new Error(`NEXT_REDIRECT:${to}`);
});
vi.mock("next/navigation", () => ({ redirect }));

const logger = { error: vi.fn() };
const auth = { signInGuest: vi.fn(), signInEmail: vi.fn(), signUp: vi.fn(), signOut: vi.fn() };
vi.mock("@/infrastructure/container", () => ({ getContainer: () => ({ logger, auth }) }));

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}

describe("redirect after runAction", () => {
  it("lets the framework redirect escape untouched: not converted to a failure, not logged as unexpected", async () => {
    const digest = "NEXT_REDIRECT;replace;/boards;307;";
    redirect.mockImplementationOnce(() => {
      throw Object.assign(new Error("NEXT_REDIRECT"), { digest });
    });
    auth.signInGuest.mockResolvedValue({ userId: "g", isGuest: true });
    const error = await actions.signInGuestAction().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as { digest: string }).digest).toBe(digest);
    expect(logger.error).not.toHaveBeenCalled();
  });
});

const actions = await import("@/app/_actions/auth");

beforeEach(() => vi.clearAllMocks());

describe("signInEmailAction", () => {
  it("passes only the form fields, then redirects to the safe destination", async () => {
    auth.signInEmail.mockResolvedValue({ userId: "u", isGuest: false });
    await expect(actions.signInEmailAction(undefined, form({ email: "a@b.co", password: "pw", next: "/boards/1" }))).rejects.toThrow("NEXT_REDIRECT:/boards/1");
    expect(auth.signInEmail).toHaveBeenCalledWith({ email: "a@b.co", password: "pw" });
  });

  it("ignores an external next target", async () => {
    auth.signInEmail.mockResolvedValue({ userId: "u", isGuest: false });
    await expect(actions.signInEmailAction(undefined, form({ email: "a@b.co", password: "pw", next: "https://evil.example" }))).rejects.toThrow("NEXT_REDIRECT:/boards");
  });

  it("returns the typed failure instead of redirecting", async () => {
    auth.signInEmail.mockRejectedValue(new ValidationError("Invalid input", { email: ["bad"] }));
    expect(await actions.signInEmailAction(undefined, form({ email: "x", password: "" }))).toEqual({
      ok: false, code: "VALIDATION", message: "Invalid input", fieldErrors: { email: ["bad"] },
    });
    expect(redirect).not.toHaveBeenCalled();
  });

  it("surfaces rate limits with their retry hint", async () => {
    auth.signInEmail.mockRejectedValue(new RateLimitError(42));
    expect(await actions.signInEmailAction(undefined, form({ email: "a@b.co", password: "pw" }))).toMatchObject({ code: "RATE_LIMITED", retryAfterSeconds: 42 });
  });

  it("logs unexpected errors through the redacting logger and hides them from the client", async () => {
    auth.signInEmail.mockRejectedValue(new Error("boom"));
    expect(await actions.signInEmailAction(undefined, form({ email: "a@b.co", password: "pw" }))).toEqual({ ok: false, code: "INTERNAL", message: "Something went wrong" });
    expect(logger.error).toHaveBeenCalledOnce();
  });
});

describe("signUpAction", () => {
  it("registers and redirects, or reports a duplicate email as a conflict", async () => {
    auth.signUp.mockResolvedValueOnce({ userId: "u", isGuest: false });
    await expect(actions.signUpAction(undefined, form({ email: "a@b.co", password: "long-enough", name: "Ada" }))).rejects.toThrow("NEXT_REDIRECT:/boards");
    expect(auth.signUp).toHaveBeenCalledWith({ email: "a@b.co", password: "long-enough", name: "Ada" });
    auth.signUp.mockRejectedValueOnce(new ConflictError("Email already registered"));
    expect(await actions.signUpAction(undefined, form({ email: "a@b.co", password: "long-enough", name: "Ada" }))).toMatchObject({ code: "CONFLICT" });
  });
});

describe("guest and sign-out actions", () => {
  it("guest login redirects into the app and surfaces a rate limit", async () => {
    auth.signInGuest.mockResolvedValueOnce({ userId: "g", isGuest: true });
    await expect(actions.signInGuestAction()).rejects.toThrow("NEXT_REDIRECT:/boards");
    auth.signInGuest.mockRejectedValueOnce(new RateLimitError(3600));
    expect(await actions.signInGuestAction()).toMatchObject({ code: "RATE_LIMITED", retryAfterSeconds: 3600 });
  });

  it("sign-out ends the session and sends the user to the login page", async () => {
    auth.signOut.mockResolvedValue(undefined);
    await expect(actions.signOutAction()).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(auth.signOut).toHaveBeenCalledOnce();
  });
});
