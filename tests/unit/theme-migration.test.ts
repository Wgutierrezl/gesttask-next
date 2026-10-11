import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const src = fileURLToPath(new URL("../../src/", import.meta.url));
const MIGRATED = [
  "components/ui",
  "components/shell",
  "components/boards",
  "components/dashboard",
  "components/auth",
  "app/page.tsx",
  "app/layout.tsx",
  "app/(app)/layout.tsx",
  "app/(app)/dashboard",
  "app/(app)/boards/page.tsx",
  "app/(app)/boards/[boardId]/page.tsx",
  "app/(app)/boards/[boardId]/settings",
  "app/(app)/boards/[boardId]/dashboard",
  "app/(auth)",
];

// Fixed light-theme colors do not follow `data-theme`, so migrated code names a role (`bg-surface`) instead.
// Allowed on purpose: `text-white` and `bg-danger-600/700` (theme-independent fills), `bg-brand-gradient`.
const PALETTES = "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
const UTILITIES = "bg|text|border|ring|divide|outline|from|via|to|fill|stroke|decoration|shadow|accent|caret";
const RAW = new RegExp(
  [
    String.raw`\b(?:${UTILITIES})-(?:white|black)\b`,
    String.raw`\b(?:${UTILITIES})-(?:${PALETTES})-\d+`,
    String.raw`\b(?:bg|border|ring|from|via|to|outline|text)-brand-\d+`,
    String.raw`\bbg-(?:danger|warning|success)-50\b|\btext-(?:danger|warning|success)-700\b`,
    String.raw`\bshadow-(?:xs|sm|md|lg|xl|2xl)\b`,
    String.raw`-\[[^\]]*(?:rgb|hsl|oklch)\(|-\[#[0-9a-fA-F]{3,8}\]`,
  ].join("|"),
);
const ALLOWED = /\btext-white\b|\b(?:hover:)?bg-danger-(?:600|700)\b/g;

function files(path: string): string[] {
  const full = `${src}${path}`;
  if (path.endsWith(".tsx")) return [full];
  return readdirSync(full, { recursive: true, encoding: "utf8" }).filter((name) => /\.tsx?$/.test(name)).map((name) => `${full}/${name}`);
}

describe("theme migration of the primitives, shell, landing, auth, boards and dashboards", () => {
  it("finds the files it is meant to guard", () => {
    expect(MIGRATED.flatMap(files).length).toBeGreaterThan(50);
  });

  it.each(MIGRATED.flatMap(files))("%s uses semantic tokens only", (file) => {
    const raw = readFileSync(file, "utf8").split("\n").filter((line) => RAW.test(line.replace(ALLOWED, "")));
    expect(raw).toEqual([]);
  });

  it.each(["text-black", "text-red-600", "border-brand-600", "bg-brand-50", "shadow-2xl", "bg-[#fff]", "bg-[rgb(1_2_3)]", "to-emerald-100", "bg-neutral-900"])("flags %s", (cls) => {
    expect(RAW.test(cls)).toBe(true);
  });
  it.each(["text-fg", "bg-brand-gradient", "shadow-pop", "bg-[linear-gradient(var(--grid-line))]", "border-brand-link"])("accepts %s", (cls) => {
    expect(RAW.test(cls)).toBe(false);
  });
});
