import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const src = fileURLToPath(new URL("../../src/", import.meta.url));
const MIGRATED = ["components/ui", "components/shell", "app/page.tsx", "app/layout.tsx"];
// Fixed light-theme colors: they do not follow `data-theme`, so migrated code must use the semantic tokens instead.
// `text-white` stays: it sits on the theme-independent brand gradient and danger fill.
const RAW = new RegExp(
  [
    String.raw`\b(?:bg|border|ring|divide|outline|from|via|to)-(?:white|black)\b`,
    String.raw`\b(?:bg|text|border|ring|divide|outline|from|via|to)-(?:slate|gray|zinc|blue|indigo)-\d+`,
    String.raw`\bbg-(?:brand-50|danger-50|warning-50|success-50)\b|\btext-(?:brand-700|danger-700|warning-700|success-700)\b`,
  ].join("|"),
);

function files(path: string): string[] {
  const full = `${src}${path}`;
  return path.endsWith(".tsx") ? [full] : readdirSync(full).filter((name) => name.endsWith(".tsx")).map((name) => `${full}/${name}`);
}

describe("theme migration of the primitives, shell and landing", () => {
  it.each(MIGRATED.flatMap(files))("%s uses semantic tokens only", (file) => {
    const raw = readFileSync(file, "utf8").split("\n").filter((line) => RAW.test(line));
    expect(raw).toEqual([]);
  });
});
