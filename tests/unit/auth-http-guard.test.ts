import { describe, expect, it, vi } from "vitest";
import { guardAuthHandler } from "@/infrastructure/auth/http-guard";

const call = async (method: string, path: string) => {
  const inner = vi.fn(async () => new Response("inner"));
  const response = await guardAuthHandler(inner)(new Request(`http://localhost/api/auth${path}`, { method }));
  return { status: response.status, reached: inner.mock.calls.length === 1 };
};

describe("guardAuthHandler", () => {
  it("lets the session read and sign-out through", async () => {
    expect(await call("GET", "/get-session")).toEqual({ status: 200, reached: true });
    expect(await call("POST", "/sign-out")).toEqual({ status: 200, reached: true });
    expect(await call("GET", "/get-session/")).toEqual({ status: 200, reached: true });
  });

  it("answers 404 without reaching Better Auth for credential and guest flows", async () => {
    for (const [method, path] of [
      ["POST", "/sign-in/email"],
      ["POST", "/sign-up/email"],
      ["POST", "/sign-in/anonymous"],
      ["POST", "/delete-anonymous-user"],
      ["POST", "/change-password"],
      ["POST", "/request-password-reset"],
      ["GET", "/sign-in/anonymous"],
    ] as const) {
      expect(await call(method, path), `${method} ${path}`).toEqual({ status: 404, reached: false });
    }
  });

  it("matches method and path exactly (no case, encoding or traversal tricks)", async () => {
    for (const [method, path] of [
      ["POST", "/get-session"],
      ["GET", "/sign-out"],
      ["POST", "/SIGN-IN/EMAIL"],
      ["POST", "/sign-out/../sign-in/email"],
      ["POST", "/sign%2Din/email"],
      ["POST", "//sign-in/email"],
      ["DELETE", "/sign-out"],
    ] as const) {
      expect((await call(method, path)).reached, `${method} ${path}`).toBe(false);
    }
  });
});
