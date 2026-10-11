/**
 * One-off mapping of raw light-theme utilities to the semantic tokens (ADR 0022).
 * Each target resolves to the exact light value of its source, so the light look is unchanged.
 * Run per directory with `pnpm tsx scripts/codemod-theme.ts <dir...>`, then review the diff.
 */
const MAP: Record<string, string> = {
  "text-slate-900": "text-fg",
  "text-slate-800": "text-fg",
  "text-slate-700": "text-fg-strong",
  "text-slate-600": "text-fg-muted",
  "text-slate-500": "text-fg-subtle",
  "text-slate-400": "text-fg-subtle",
  "bg-white": "bg-surface",
  "bg-slate-50": "bg-canvas",
  "bg-slate-100": "bg-surface-muted",
  "border-slate-200": "border-border",
  "border-slate-100": "border-border-subtle",
  "border-slate-300": "border-border-strong",
  "divide-slate-200": "divide-border",
  "divide-slate-100": "divide-border-subtle",
  "ring-slate-200": "ring-border",
  "bg-brand-50": "bg-brand-soft",
  "text-brand-700": "text-brand-link",
  "text-brand-600": "text-accent",
  "bg-danger-50": "bg-danger-soft",
  "text-danger-700": "text-danger-fg",
  "bg-warning-50": "bg-warning-soft",
  "text-warning-700": "text-warning-fg",
  "bg-success-50": "bg-success-soft",
  "text-success-700": "text-success-fg",
  "outline-brand-600": "outline-ring",
  "bg-slate-900": "bg-backdrop",
};

// A class is `[variant:]*utility-color[/opacity]`, delimited by anything that cannot be part of a class name.
const CLASS = /(?<![\w-])((?:[a-z-]+:)*)((?:text|bg|border|divide|ring|outline)-[a-z]+(?:-\d+)?)(\/\d+)?(?![\w-])/g;

/** Under `hover:` a near-white fill is the row highlight, not the page canvas. */
const HOVER_MAP: Record<string, string> = { "bg-slate-50": "bg-surface-hover" };

/** `bg-slate-900/40` is the dialog backdrop only behind the `backdrop:` variant; elsewhere it stays untouched. */
export function migrateTheme(source: string): string {
  return source.replace(CLASS, (match, variants: string, utility: string, opacity: string | undefined) => {
    if (utility === "bg-slate-900") return variants.endsWith("backdrop:") && opacity === "/40" ? `${variants}bg-backdrop` : match;
    const target = (variants.endsWith("hover:") ? HOVER_MAP[utility] : undefined) ?? MAP[utility];
    return target ? `${variants}${target}${opacity ?? ""}` : match;
  });
}
