import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { badgeColor, linesPercent, renderBadge } from "../../scripts/lib/coverage-badge";

describe("badgeColor", () => {
  it.each([
    [100, "#2ea043"],
    [90, "#2ea043"],
    [89.99, "#d29922"],
    [75, "#d29922"],
    [74.9, "#cf222e"],
    [0, "#cf222e"],
  ])("colors %s%% as %s: green at the 90%% gate, amber down to 75%%, red below", (percent, color) => {
    expect(badgeColor(percent)).toBe(color);
  });
});

describe("linesPercent", () => {
  it("reads the lines percentage of a vitest json-summary", () => {
    expect(linesPercent({ total: { lines: { pct: 97.63 }, statements: { pct: 1 } } })).toBe(97.63);
    expect(linesPercent({ total: { lines: { pct: 81 } } })).toBe(81);
  });

  it.each([{}, { total: {} }, { total: { lines: { pct: "n/a" } } }, { total: { lines: { pct: 120 } } }, null])("refuses a summary without a usable percentage: %j", (summary) => {
    expect(() => linesPercent(summary)).toThrow(/coverage/i);
  });
});

describe("renderBadge", () => {
  const svg = renderBadge("coverage", 97.63);

  it("is a self-contained SVG that names the metric and the rounded value, accessibly", () => {
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain('role="img"');
    expect(svg).toContain('aria-label="coverage: 97.6%"');
    expect(svg).toContain("<title>coverage: 97.6%</title>");
    expect(svg).toContain(">coverage<");
    expect(svg).toContain(">97.6%<");
    expect(svg.replace('xmlns="http://www.w3.org/2000/svg"', "")).not.toMatch(/https?:/); // no external references
  });

  it("uses the color of the value and widens with the text", () => {
    expect(svg).toContain("#2ea043");
    expect(renderBadge("coverage", 60)).toContain("#cf222e");
    const width = (text: string) => Number(/width="(\d+)"/.exec(text)![1]);
    expect(width(renderBadge("a much longer label", 100))).toBeGreaterThan(width(renderBadge("cov", 100)));
  });

  it("escapes the label so it cannot break the markup", () => {
    expect(renderBadge('a<b>&"', 95)).toContain("a&lt;b&gt;&amp;&quot;");
  });
});

describe("the committed badge", () => {
  it("shows a coverage at or above the 90% gate (regenerate it with `pnpm coverage:badge`)", () => {
    const committed = readFileSync("docs/badges/coverage.svg", "utf8");
    const shown = Number(/aria-label="coverage: ([\d.]+)%"/.exec(committed)?.[1]);
    expect(shown).toBeGreaterThanOrEqual(90);
    expect(shown).toBeLessThanOrEqual(100);
  });
});
