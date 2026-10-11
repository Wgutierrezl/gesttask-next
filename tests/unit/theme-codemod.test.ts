import { describe, expect, it } from "vitest";
import { migrateTheme } from "../../scripts/lib/theme-codemod";

describe("migrateTheme", () => {
  it.each([
    ["text-slate-900", "text-fg"],
    ["text-slate-800", "text-fg"],
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
    ["backdrop:bg-slate-900/40", "backdrop:bg-backdrop"],
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
});
