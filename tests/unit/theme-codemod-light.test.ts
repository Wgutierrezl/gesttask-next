import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { HOVER_MAP, LIGHT_EXCEPTIONS, MAP } from "../../scripts/lib/theme-codemod";

const css = readFileSync(fileURLToPath(new URL("../../src/app/globals.css", import.meta.url)), "utf8");

/** Declarations of the light `:root` block and of `@theme` (the raw brand/tone scales). */
function declarations(opener: string): Record<string, string> {
  const start = css.indexOf(opener);
  const body = css.slice(css.indexOf("{", start) + 1, css.indexOf("\n}", start));
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [name!, value!.trim()]));
}
const root = declarations(":root {");
const theme = declarations("@theme {");

// Tailwind's default slate palette, the source of truth for what the old classes rendered.
const SLATE: Record<string, string> = {
  "slate-50": "#f8fafc", "slate-100": "#f1f5f9", "slate-200": "#e2e8f0", "slate-300": "#cbd5e1", "slate-400": "#94a3b8",
  "slate-500": "#64748b", "slate-600": "#475569", "slate-700": "#334155", "slate-800": "#1e293b", "slate-900": "#0f172a",
};
/** The hex of a source color: slate and white from Tailwind, brand and tones from the project's own scale. */
function sourceHex(color: string): string {
  if (color === "white") return "#ffffff";
  return (SLATE[color] ?? theme[`color-${color}`])!;
}
const split = (cls: string) => {
  const [, utility, color] = /^(text|bg|border|divide|ring|outline)-(.+)$/.exec(cls)!;
  return { utility: utility!, color: color! };
};

const entries = [...Object.entries(MAP), ...Object.entries(HOVER_MAP).map(([k, v]) => [k, v] as const)];

describe("codemod mapping keeps the light theme exact", () => {
  it("covers a real number of mappings (guards the parsers against matching nothing)", () => {
    expect(entries.length).toBeGreaterThan(20);
    expect(Object.keys(root).length).toBeGreaterThan(30);
    expect(sourceHex("slate-800")).toBe("#1e293b");
  });

  it.each(entries.filter(([source]) => !(source in LIGHT_EXCEPTIONS)))("%s -> %s resolves to the same light hex", (source, target) => {
    const token = split(target).color;
    const resolved = root[token];
    expect(resolved, `--${token} is defined in :root`).toBeDefined();
    expect(resolved!.toLowerCase()).toBe(sourceHex(split(source).color).toLowerCase());
  });

  it.each(Object.entries(LIGHT_EXCEPTIONS))("%s is a documented exception with a reason, and the token differs only as documented", (source, exception) => {
    expect(exception.reason.length).toBeGreaterThan(20);
    const resolved = root[split(MAP[source]!).color]!;
    expect(resolved.toLowerCase()).toBe(exception.light.toLowerCase());
    expect(resolved.toLowerCase()).not.toBe(sourceHex(split(source).color).toLowerCase());
  });
});
