import { describe, expect, it } from "vitest";
import { DEFAULT_THEME, isTheme, resolveTheme, THEMES } from "./config";

describe("theme allowlist", () => {
  it("offers light, dark and system, defaulting to system", () => {
    expect(THEMES).toEqual(["light", "dark", "system"]);
    expect(DEFAULT_THEME).toBe("system");
  });
  it.each(["light", "dark", "system"])("accepts %s", (value) => expect(isTheme(value)).toBe(true));
  it.each(["auto", "../x", "", "DARK", null, undefined, 1])("rejects %j", (value) => expect(isTheme(value)).toBe(false));
  it("resolves an absent or invalid cookie to system", () => {
    expect(resolveTheme("dark")).toBe("dark");
    expect(resolveTheme("light")).toBe("light");
    expect(resolveTheme("neon")).toBe("system");
    expect(resolveTheme(undefined)).toBe("system");
  });
});
