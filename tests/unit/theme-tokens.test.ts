import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = readFileSync(fileURLToPath(new URL("../../src/app/globals.css", import.meta.url)), "utf8");

/** The declarations of the block that opens with `selector {` (nested braces are not used by the theme blocks). */
function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`no block for ${selector}`);
  const body = css.slice(css.indexOf("{", start) + 1, css.indexOf("}", start));
  return Object.fromEntries([...body.matchAll(/(--[\w-]+|color-scheme):\s*([^;]+);/g)].map(([, name, value]) => [name, value!.trim()]));
}

const light = block(":root");
const dark = block(':root[data-theme="dark"]');
const system = block(':root:not([data-theme="light"]):not([data-theme="dark"])');

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

describe("theme tokens", () => {
  it("the system block (media query) repeats the pinned dark values exactly", () => {
    expect(system).toEqual(dark);
  });

  it("parses a real token set from each block (guards the parser against matching nothing)", () => {
    for (const tokens of [light, dark, system]) expect(Object.keys(tokens).length).toBeGreaterThan(35);
  });

  it("defines the same tokens in light and dark, and tells the browser which scheme is active", () => {
    expect(Object.keys(dark).sort()).toEqual(Object.keys(light).sort());
    expect([light["color-scheme"], dark["color-scheme"]]).toEqual(["light", "dark"]);
  });

  it("wraps the system block in a prefers-color-scheme: dark media query", () => {
    expect(css).toMatch(/@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme="light"\]\):not\(\[data-theme="dark"\]\) \{/);
  });

  describe.each([["light", light], ["dark", dark]] as const)("contrast in %s", (_name, t) => {
    const surfaces = ["--canvas", "--surface", "--elevated"] as const;
    it.each(surfaces)("text tokens reach 4.5:1 on %s", (surface) => {
      for (const fg of ["--fg", "--fg-strong", "--fg-muted", "--fg-subtle", "--brand-link"]) {
        expect(contrast(t[fg]!, t[surface]!), `${fg} on ${surface}`).toBeGreaterThanOrEqual(4.5);
      }
    });
    it("muted text stays readable on the muted surface", () => {
      for (const fg of ["--fg", "--fg-muted"]) expect(contrast(t[fg]!, t["--surface-muted"]!), fg).toBeGreaterThanOrEqual(4.5);
    });
    it.each([["brand", "--brand-link", "--brand-soft"], ["danger", "--danger-fg", "--danger-soft"], ["warning", "--warning-fg", "--warning-soft"], ["success", "--success-fg", "--success-soft"]])(
      "%s tone text reaches 4.5:1 on its soft background",
      (_tone, fg, bg) => expect(contrast(t[fg!]!, t[bg!]!)).toBeGreaterThanOrEqual(4.5),
    );
    it.each(surfaces)("the focus ring reaches 3:1 on %s", (surface) => expect(contrast(t["--ring"]!, t[surface]!)).toBeGreaterThanOrEqual(3));
  });

  it("the avatar lightness tokens keep initials at 4.5:1 for every hue, in both themes", () => {
    const rgbOf = (h: number, l: number) => {
      const a = 0.6 * Math.min(l, 1 - l);
      const channel = (n: number) => { const k = (n + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
      return "#" + [0, 8, 4].map((n) => Math.round(channel(n) * 255).toString(16).padStart(2, "0")).join("");
    };
    for (const [name, t] of [["light", light], ["dark", dark]] as const) {
      const [bg, fg] = [t["--avatar-l-bg"]!, t["--avatar-l-fg"]!].map((v) => parseFloat(v) / 100) as [number, number];
      for (let hue = 0; hue < 360; hue += 15) expect(contrast(rgbOf(hue, fg), rgbOf(hue, bg)), `${name} hue ${hue}`).toBeGreaterThanOrEqual(4.5);
    }
    expect(parseFloat(dark["--avatar-l-bg"]!)).toBeLessThan(50);
    expect(parseFloat(light["--avatar-l-bg"]!)).toBeGreaterThan(50);
  });

  it("the loading skeleton keeps its light value and is visible (1.5:1) on every surface in dark", () => {
    expect(light["--skeleton"]).toBe("#e2e8f0");
    for (const surface of ["--canvas", "--surface", "--elevated"]) expect(contrast(dark["--skeleton"]!, dark[surface]!), surface).toBeGreaterThanOrEqual(1.5);
  });

  it("white on the primary gradient and the danger fill keeps 4.5:1 (these fills are theme independent)", () => {
    const theme = (name: string) => css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-f]{6})`, "i"))?.[1] ?? "";
    const gradient = css.match(/bg-brand-gradient[\s\S]*?linear-gradient\(135deg, var\(--color-([\w-]+)\), var\(--color-([\w-]+)\)\)/)!;
    for (const name of [gradient[1]!, gradient[2]!, "danger-600", "danger-700"]) {
      expect(theme(name), name).toMatch(/^#/);
      expect(contrast("#ffffff", theme(name)), name).toBeGreaterThanOrEqual(4.5);
    }
  });
});
