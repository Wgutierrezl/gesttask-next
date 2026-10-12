import { describe, expect, it } from "vitest";
import { codemodWarnings, migrateTheme } from "../../scripts/lib/theme-codemod";

describe("migrateTheme", () => {
  it.each([
    ["text-slate-900", "text-fg"],
    ["text-slate-800", "text-fg-secondary"],
    ["text-slate-700", "text-fg-strong"],
    ["text-slate-600", "text-fg-muted"],
    ["text-slate-500", "text-fg-subtle"],
    ["text-slate-400", "text-fg-subtle"],
    ["bg-white", "bg-surface"],
    ["bg-white/80", "bg-surface/80"],
    ["bg-slate-50", "bg-canvas"],
    ["hover:bg-slate-50", "hover:bg-surface-hover"],
    ["bg-slate-100", "bg-surface-muted"],
    ["border-slate-200", "border-border"],
    ["border-slate-100", "border-border-subtle"],
    ["border-slate-300", "border-border-strong"],
    ["divide-slate-200", "divide-border"],
    ["divide-slate-100", "divide-border-subtle"],
    ["ring-slate-200", "ring-border"],
    ["bg-brand-50", "bg-brand-soft"],
    ["text-brand-700", "text-brand-link"],
    ["hover:text-brand-700", "hover:text-brand-link"],
    ["text-brand-600", "text-accent"],
    ["focus:bg-white", "focus:bg-surface"],
    ["bg-danger-50", "bg-danger-soft"],
    ["text-danger-700", "text-danger-fg"],
    ["bg-warning-50", "bg-warning-soft"],
    ["text-warning-700", "text-warning-fg"],
    ["bg-success-50", "bg-success-soft"],
    ["text-success-700", "text-success-fg"],
    ["focus-visible:outline-brand-600", "focus-visible:outline-ring"],
  ])("maps %s to %s", (from, to) => {
    expect(migrateTheme(`<div className="${from}" />`)).toBe(`<div className="${to}" />`);
  });

  it("rewrites every class in a list and leaves theme-independent ones alone", () => {
    const input = 'className="flex text-slate-600 bg-danger-600 border-danger-600/30 text-white"';
    expect(migrateTheme(input)).toBe('className="flex text-fg-muted bg-danger-600 border-danger-600/30 text-white"');
  });

  it("does not touch words that merely contain a palette name", () => {
    const input = 'const text = "sub-text-slate-6000"; // bg-whitespace';
    expect(migrateTheme(input)).toBe(input);
  });

  it("is idempotent", () => {
    const once = migrateTheme('className="text-slate-600 hover:bg-slate-50 bg-white"');
    expect(migrateTheme(once)).toBe(once);
  });

  it.each(["hover", "focus", "focus-visible", "focus-within", "active", "group-hover", "peer-focus", "group-focus-visible", "has-[:hover]", "md:hover", "dark:group-hover"])(
    "treats bg-slate-50 under %s: as a highlight, not the canvas",
    (variant) => {
      expect(migrateTheme(`"${variant}:bg-slate-50"`)).toBe(`"${variant}:bg-surface-hover"`);
    },
  );

  it.each(["bg-slate-50", "md:bg-slate-50", "first:bg-slate-50", "group-has-[a]:bg-slate-50"])("keeps bg-slate-50 as the canvas under %s", (cls) => {
    expect(migrateTheme(`"${cls}"`)).toBe(`"${cls.replace("bg-slate-50", "bg-canvas")}"`);
  });

  describe("only class contexts are rewritten", () => {
    it("leaves line, block and JSX comments untouched", () => {
      const source = [
        "// was text-slate-600 before the migration",
        "/* bg-white and text-slate-900 */",
        '<p className="text-slate-600">x</p>{/* text-slate-600 */}',
      ].join("\n");
      expect(migrateTheme(source)).toBe(source.replace('className="text-slate-600"', 'className="text-fg-muted"'));
    });

    it("rewrites class maps in plain .ts sources and cn()/clsx() arguments", () => {
      const source = 'const tones = { a: "bg-white text-slate-700", b: cn("border-slate-200", open && "bg-slate-100") };';
      expect(migrateTheme(source)).toBe('const tones = { a: "bg-surface text-fg-strong", b: cn("border-border", open && "bg-surface-muted") };');
    });

    it("rewrites template literals in className, including the text around a ${} placeholder", () => {
      expect(migrateTheme("className={`p-2 ${open ? 'bg-white' : 'bg-slate-100'} text-slate-600`}")).toBe(
        "className={`p-2 ${open ? 'bg-surface' : 'bg-surface-muted'} text-fg-muted`}",
      );
    });

    it("leaves prose strings that merely mention a class", () => {
      const source = 'const note = "Use text-slate-600 for body copy"; throw new Error("bg-white is gone");';
      expect(migrateTheme(source)).toBe(source);
    });
  });

  describe("scrims", () => {
    it.each(["backdrop:bg-slate-900/40", "backdrop:bg-slate-900/50", "bg-slate-900/40"])("leaves %s untouched and warns", (cls) => {
      const source = `className="${cls}"`;
      expect(migrateTheme(source)).toBe(source);
      expect(codemodWarnings(source)).toEqual([expect.stringContaining(cls)]);
    });

    it("does not warn about classes it maps", () => {
      expect(codemodWarnings('className="bg-white text-slate-600"')).toEqual([]);
    });
  });
});
