import { describe, expect, it } from "vitest";
import { safeNext } from "@/app/_shared/safe-next";

describe("safeNext", () => {
  it("keeps same-site relative paths, query strings included", () => {
    expect(safeNext("/boards/abc?tab=members")).toBe("/boards/abc?tab=members");
  });

  it.each([
    ["absolute URL", "https://evil.example/x"],
    ["protocol-relative URL", "//evil.example"],
    ["backslash trick", "/\\evil.example"],
    ["scheme", "javascript:alert(1)"],
    ["control characters", "/boards\r\nSet-Cookie: x=1"],
    ["empty", ""],
  ])("falls back for %s", (_name, value) => {
    expect(safeNext(value)).toBe("/boards");
  });

  it("falls back for missing or non-string values and honours a custom fallback", () => {
    expect(safeNext(undefined)).toBe("/boards");
    expect(safeNext(null)).toBe("/boards");
    expect(safeNext(["/a", "/b"])).toBe("/boards");
    expect(safeNext(undefined, "/home")).toBe("/home");
  });
});
