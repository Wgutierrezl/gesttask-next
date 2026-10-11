import { beforeEach, describe, expect, it, vi } from "vitest";

const set = vi.hoisted(() => vi.fn());
const proto = vi.hoisted(() => ({ value: null as string | null }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ set }),
  headers: async () => ({ get: (name: string) => (name === "x-forwarded-proto" ? proto.value : null) }),
}));

const { setLocaleAction } = await import("@/app/_actions/preferences");

const form = (value?: string) => {
  const data = new FormData();
  if (value !== undefined) data.set("locale", value);
  return data;
};

beforeEach(() => {
  set.mockClear();
  proto.value = null;
});

describe("setLocaleAction", () => {
  it("stores an allowlisted locale for a year, site-wide, readable by the server only", async () => {
    await setLocaleAction(form("es"));
    expect(set).toHaveBeenCalledWith("locale", "es", { path: "/", sameSite: "lax", maxAge: 31_536_000, httpOnly: true, secure: false });
  });

  it("marks the cookie secure only when the request came over HTTPS", async () => {
    proto.value = "https";
    await setLocaleAction(form("en"));
    expect(set).toHaveBeenLastCalledWith("locale", "en", expect.objectContaining({ secure: true }));
    proto.value = "https,http";
    await setLocaleAction(form("en"));
    expect(set).toHaveBeenLastCalledWith("locale", "en", expect.objectContaining({ secure: true }));
    proto.value = "http";
    await setLocaleAction(form("en"));
    expect(set).toHaveBeenLastCalledWith("locale", "en", expect.objectContaining({ secure: false }));
  });

  it.each(["fr", "../x", ""])("leaves the cookie unchanged for %j", async (value) => {
    await setLocaleAction(form(value));
    expect(set).not.toHaveBeenCalled();
  });

  it("leaves the cookie unchanged when the field is missing", async () => {
    await setLocaleAction(form());
    expect(set).not.toHaveBeenCalled();
  });
});
