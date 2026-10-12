import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import en from "./messages/en.json";
import es from "./messages/es.json";

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ""): Record<string, string> {
  return Object.entries(tree).reduce<Record<string, string>>((acc, [key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === "string" ? { ...acc, [path]: value } : { ...acc, ...flatten(value, path) };
  }, {});
}

/** Argument names and plural arms, e.g. "count|one|other". Order-insensitive. */
function shape(message: string): string {
  const names = [...message.matchAll(/\{(\w+)(?:,\s*plural,)?/g)].map((m) => m[1]);
  const arms = [...message.matchAll(/\b(zero|one|two|few|many|other|=\d+)\s*\{/g)].map((m) => m[1]);
  return [[...new Set(names)].sort().join(","), [...new Set(arms)].sort().join(",")].join("|");
}

const flatEn = flatten(en);
const flatEs = flatten(es);

describe("message catalogs", () => {
  it("have the same keys in en and es", () => {
    expect(Object.keys(flatEs).sort()).toEqual(Object.keys(flatEn).sort());
  });

  it("have no empty messages", () => {
    for (const [key, value] of [...Object.entries(flatEn), ...Object.entries(flatEs)]) expect(value, key).not.toBe("");
  });

  it("use the same ICU argument names and plural arms per key", () => {
    for (const key of Object.keys(flatEn)) expect(shape(flatEs[key] ?? ""), key).toBe(shape(flatEn[key] ?? ""));
  });

  it.each([["en", en], ["es", es]] as const)("compiles every %s message as valid ICU", (locale, messages) => {
    const t = createTranslator({ locale, messages: messages as never, onError: (error) => { throw error; } }) as unknown as (key: string, values: Record<string, unknown>) => string;
    for (const [key, message] of Object.entries(flatten(messages))) {
      const args = [...message.matchAll(/\{(\w+)/g)].map((m) => [m[1], 1] as const);
      const tags = [...message.matchAll(/<(\w+)>/g)].map((m) => [m[1], (chunks: unknown) => chunks] as const);
      const values = Object.fromEntries([...args, ...tags]);
      expect(() => t(key, values), key).not.toThrow();
    }
  });

  it("measures shape correctly", () => {
    expect(shape("{count, plural, one {# task} other {# tasks}}")).toBe("count|one,other");
    expect(shape("Hi {name}")).toBe("name|");
  });
});
