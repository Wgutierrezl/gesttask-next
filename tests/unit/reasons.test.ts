import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import en from "@/i18n/messages/en.json";
import es from "@/i18n/messages/es.json";

const ROOTS = ["src/domain", "src/application", "src/infrastructure", "src/app"];

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

/** Every reason a throw site declares: `reason: "stage.hasTasks"`, in the core, its adapters and the web layer. */
const used = new Map<string, string>();
for (const file of ROOTS.flatMap(sources)) {
  for (const match of readFileSync(file, "utf8").matchAll(/\breason: "([\w.]+)"/g)) used.set(match[1]!, file);
}

const lookup = (catalog: unknown, path: string): unknown => path.split(".").reduce<unknown>((node, key) => (node as Record<string, unknown> | undefined)?.[key], catalog);
const has = (catalog: typeof en, key: string) => typeof lookup(catalog.errors.reason, key) === "string" || typeof lookup(catalog.errors.validation, key) === "string";

describe("error reason keys", () => {
  it("finds the throw sites it is meant to guard", () => {
    expect(used.size).toBeGreaterThan(15);
    expect(used.has("stage.hasTasks")).toBe(true);
    expect(used.has("confirmationRequired")).toBe(true);
  });

  it.each([["en", en], ["es", es]] as const)("every reason used in src exists in the %s catalog", (_locale, catalog) => {
    const missing = [...used.keys()].filter((key) => !has(catalog, key));
    expect(missing).toEqual([]);
  });

  it.each([["en", en], ["es", es]] as const)("has the generic validation reasons parse.ts emits and a default for every code in %s", (_locale, catalog) => {
    for (const key of ["tooSmall", "tooBig", "invalidEmail"]) expect(typeof lookup(catalog.errors.validation, key), key).toBe("string");
    for (const code of ["VALIDATION", "UNAUTHENTICATED", "FORBIDDEN", "NOT_FOUND", "CONFLICT", "RATE_LIMITED", "STORAGE", "UNAVAILABLE", "INTERNAL"]) expect(typeof lookup(catalog.errors.code, code), code).toBe("string");
    for (const what of ["deleteBoard", "deleteTask", "deleteComment", "removeMember"]) expect(typeof lookup(catalog.errors.validation, `confirm.${what}`), what).toBe("string");
  });
});
