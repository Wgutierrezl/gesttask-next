import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const src = fileURLToPath(new URL("../../src/", import.meta.url));
// Everything that renders UI: all of `components` and `app`. Documented exceptions live in ALLOWED below.
const MIGRATED = ["components", "app"];

// Fixed light-theme colors do not follow `data-theme`, so migrated code names a role (`bg-surface`) instead.
// Allowed on purpose: `text-white` and `bg-danger-600/700` (theme-independent fills), `bg-brand-gradient`, and solid
// 600 accents (`border-danger-600`, `text-success-600`), which stay legible on both themes.
const PALETTES = "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
const UTILITIES = "bg|text|border|border-[xytblrse]|ring|ring-offset|divide|outline|from|via|to|fill|stroke|decoration|shadow|accent|caret";
const RAW = new RegExp(
  [
    String.raw`\b(?:${UTILITIES})-(?:white|black)\b`,
    String.raw`\b(?:${UTILITIES})-(?:${PALETTES})-\d+`,
    String.raw`\b(?:bg|border|ring|from|via|to|outline|text|accent|fill|stroke)-brand-\d+`,
    String.raw`\bbg-(?:danger|warning|success)-50\b|\btext-(?:danger|warning|success)-700\b|\b(?:border|ring)-(?:danger|warning|success)-\d+/\d+`,
    String.raw`\bshadow-(?:xs|sm|md|lg|xl|2xl)\b`,
    String.raw`-\[[^\]]*(?:rgb|hsl|oklch)\(|-\[#[0-9a-fA-F]{3,8}\]`,
  ].join("|"),
);
// Colors written inline (`style={{ color: "#fff" }}`) bypass the tokens as well; the brand art module paints with its own palette.
const INLINE_STYLE = /\bstyle\b.*(?:#[0-9a-fA-F]{3,8}\b|\b(?:rgb|hsl|oklch|oklab|lab)a?\()/;
const INLINE_ALLOWED = ["/components/brand/"];
const ALLOWED = /\btext-white\b|\b(?:hover:)?bg-danger-(?:600|700)\b/g;

function files(path: string): string[] {
  const full = `${src}${path}`;
  if (path.endsWith(".tsx")) return [full];
  return readdirSync(full, { recursive: true, encoding: "utf8" }).filter((name) => /\.tsx?$/.test(name)).map((name) => `${full}/${name}`);
}

describe("theme migration of every component and page", () => {
  it("finds the files it is meant to guard", () => {
    expect(MIGRATED.flatMap(files).length).toBeGreaterThan(100);
  });

  it.each(MIGRATED.flatMap(files))("%s uses semantic tokens only", (file) => {
    const raw = readFileSync(file, "utf8").split("\n").filter((line) => RAW.test(line.replace(ALLOWED, "")));
    expect(raw).toEqual([]);
  });

  it.each(MIGRATED.flatMap(files).filter((file) => !INLINE_ALLOWED.some((part) => file.includes(part))))("%s paints no inline color", (file) => {
    expect(readFileSync(file, "utf8").split("\n").filter((line) => INLINE_STYLE.test(line))).toEqual([]);
  });

  it.each(["style={{ color: '#fff' }}", 'style={{ backgroundColor: "hsl(1 2% 3%)" }}', "style={{ background: `rgb(1 2 3)` }}"])("flags the inline style %s", (line) => {
    expect(INLINE_STYLE.test(line)).toBe(true);
  });
  it("accepts an inline style that only carries a variable", () => {
    expect(INLINE_STYLE.test('style={{ "--avatar-hue": hue }}')).toBe(false);
  });

  it.each(["ring-offset-white", "ring-offset-slate-100", "ring-offset-black"])("flags %s", (cls) => {
    expect(RAW.test(cls)).toBe(true);
  });
  it("accepts ring-offset-surface", () => {
    expect(RAW.test("ring-offset-surface")).toBe(false);
  });

  it.each(["text-black", "border-l-slate-300", "border-danger-600/30", "text-red-600", "border-brand-600", "bg-brand-50", "shadow-2xl", "bg-[#fff]", "bg-[rgb(1_2_3)]", "to-emerald-100", "bg-neutral-900"])("flags %s", (cls) => {
    expect(RAW.test(cls)).toBe(true);
  });
  it.each(["text-fg", "bg-brand-gradient", "shadow-pop", "bg-[linear-gradient(var(--grid-line))]", "border-brand-link", "border-danger-edge", "border-l-border-strong", "ring-ring"])("accepts %s", (cls) => {
    expect(RAW.test(cls)).toBe(false);
  });
});
