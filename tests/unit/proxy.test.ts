import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { config, proxy } from "@/proxy";

const request = (path: string, cookie?: string) =>
  new NextRequest(`http://localhost:3000${path}`, { headers: cookie ? { cookie } : {} });

describe("proxy", () => {
  it("redirects a visitor without a session cookie to the login page, remembering the destination", () => {
    const response = proxy(request("/boards/abc?tab=members"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3000/login?next=%2Fboards%2Fabc%3Ftab%3Dmembers");
  });

  it("lets requests with a session cookie through (validation happens in the layout guard)", () => {
    const response = proxy(request("/boards", "better-auth.session_token=abc.def"));
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("only runs on protected paths", () => {
    expect(config.matcher).toEqual(["/boards/:path*", "/dashboard/:path*"]);
  });
});
