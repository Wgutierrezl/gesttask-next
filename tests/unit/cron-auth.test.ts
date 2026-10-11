import { describe, expect, it } from "vitest";
import { isCronAuthorized } from "@/infrastructure/cron-auth";

const SECRET = "cron-secret-0123456789abcdef";

describe("isCronAuthorized (Vercel sends `Authorization: Bearer $CRON_SECRET`)", () => {
  it("accepts exactly the configured secret as a bearer token", () => {
    expect(isCronAuthorized(`Bearer ${SECRET}`, SECRET)).toBe(true);
  });

  it.each([
    ["no header", null],
    ["empty header", ""],
    ["the bare secret without the scheme", SECRET],
    ["another scheme", `Basic ${SECRET}`],
    ["a lowercase scheme", `bearer ${SECRET}`],
    ["a wrong secret of the same length", `Bearer ${SECRET.replace(/.$/, "X")}`],
    ["a prefix of the secret", `Bearer ${SECRET.slice(0, -1)}`],
    ["the secret with a suffix", `Bearer ${SECRET}x`],
    ["the secret with trailing whitespace", `Bearer ${SECRET} `],
  ])("refuses %s", (_name, header) => {
    expect(isCronAuthorized(header, SECRET)).toBe(false);
  });

  it("refuses everything when no secret is configured, even an empty bearer: the endpoint is closed, not open", () => {
    expect(isCronAuthorized("Bearer ", undefined)).toBe(false);
    expect(isCronAuthorized("Bearer undefined", undefined)).toBe(false);
    expect(isCronAuthorized("Bearer ", "")).toBe(false);
  });
});
