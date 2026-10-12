/**
 * One-off mapping of raw light-theme utilities to the semantic tokens (ADR 0022).
 * Run per directory with `pnpm tsx scripts/codemod-theme.ts <dir...>`, then review the diff.
 *
 * Every target resolves to the exact light value of its source (a unit test compares them with globals.css),
 * except the entries of LIGHT_EXCEPTIONS below. Class names are only rewritten where they are classes: inside
 * string and template literals that belong to `className=`/`class=`/`cn()`/`clsx()`/`cva()`/`twMerge()`, or that
 * read as a bare class list (class maps in .ts files). Comments and prose strings are left alone. Scrims
 * (`bg-slate-900/NN`) have no exact token, so they are never rewritten: `codemodWarnings` reports them for a manual call.
 */
export const MAP: Record<string, string> = {
  "text-slate-900": "text-fg",
  "text-slate-800": "text-fg-secondary",
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
};

/** Under an interactive state a near-white fill is the row highlight, not the page canvas. */
export const HOVER_MAP: Record<string, string> = { "bg-slate-50": "bg-surface-hover" };

/** Where the light value deliberately differs from the source class. Anything else must match exactly. */
export const LIGHT_EXCEPTIONS: Record<string, { light: string; reason: string }> = {
  "text-slate-500": {
    light: "#5b6b82",
    reason: "Intentional AA darkening of #64748b: on white and on the muted surface it falls short of 4.5:1 (ADR 0022).",
  },
  "text-slate-400": {
    light: "#5b6b82",
    reason: "#94a3b8 is only ~2.6:1 on white, so it maps to the AA-safe subtle token instead of a lighter shade that would fail contrast.",
  },
};

const UTILITY = "(?:text|bg|border|divide|ring|outline)";
const VARIANT = String.raw`(?:[a-z][a-z0-9-]*(?:-\[[^\]]*\])?|\[[^\]]*\]):`;
// A class is `[variant:]*utility-color[/opacity]`, delimited by anything that cannot be part of a class name.
const CLASS = new RegExp(String.raw`(?<![\w-])((?:${VARIANT})*)(${UTILITY}-[a-z]+(?:-\d+)?)(\/\d+)?(?![\w-])`, "g");
const SCRIM = new RegExp(String.raw`(?<![\w-])(?:${VARIANT})*bg-slate-900\/\d+(?![\w-])`, "g");

const INTERACTIVE = /^(?:(?:group|peer|has)-)?(?:hover|focus|focus-visible|focus-within|active)$|^(?:group|peer|has)-\[[^\]]*:(?:hover|focus|active)|^\[[^\]]*:(?:hover|focus|active)/;
const isInteractive = (variants: string) =>
  (variants.match(new RegExp(VARIANT, "g")) ?? []).some((variant) => INTERACTIVE.test(variant.slice(0, -1)) || /^(?:group-|peer-)?has-\[[^\]]*:(?:hover|focus|active)/.test(variant));

function migrateClasses(text: string): string {
  return text.replace(CLASS, (match, variants: string, utility: string, opacity: string | undefined) => {
    const target = (isInteractive(variants) ? HOVER_MAP[utility] : undefined) ?? MAP[utility];
    return target ? `${variants}${target}${opacity ?? ""}` : match;
  });
}

const CLASS_CONTEXT = /(?:\b(?:className|class)\s*=\s*(?:\{[^{}"'`]*)?|\b(?:cn|clsx|cva|twMerge|classNames)\([^)]*)$/;
// Words that are classes without a dash or colon; every other token of a class list has one.
const BARE = new Set(["flex", "grid", "block", "inline", "hidden", "relative", "absolute", "fixed", "sticky", "truncate", "underline", "uppercase", "italic", "border", "rounded", "shadow", "transition", "contents", "container", "static", "isolate", "grow", "shrink", "resize", "ring", "outline", "sr-only", "lowercase", "capitalize", "antialiased"]);
const looksLikeClassList = (text: string) => {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  return tokens.length > 0 && tokens.every((token) => BARE.has(token) || /[-:[]/.test(token));
};

/** Rewrites the raw palette classes in `source`; see the header for what counts as a class. */
export function migrateTheme(source: string): string {
  let out = "";
  let i = 0;
  while (i < source.length) {
    const rest = source.slice(i);
    if (rest.startsWith("//") || rest.startsWith("/*")) {
      const found = rest.indexOf(rest.startsWith("//") ? "\n" : "*/");
      const end = found < 0 ? rest.length : found + (rest.startsWith("//") ? 0 : 2);
      out += rest.slice(0, end);
      i += end;
      continue;
    }
    const quote = source[i]!;
    if (quote === '"' || quote === "'" || quote === "`") {
      const end = literalEnd(source, i);
      if (end > 0) {
        const body = source.slice(i + 1, end);
        const inClass = CLASS_CONTEXT.test(source.slice(Math.max(0, i - 200), i));
        out += quote + (quote === "`" ? migrateTemplate(body, inClass) : inClass || looksLikeClassList(body) ? migrateClasses(body) : body) + quote;
        i = end + 1;
        continue;
      }
    }
    out += source[i];
    i += 1;
  }
  return out;
}

/** Index of the quote that closes the literal opened at `start`, or -1 when it does not close on its line (JSX text such as "don't"). */
function literalEnd(source: string, start: number): number {
  const quote = source[start]!;
  for (let i = start + 1; i < source.length; i += 1) {
    const c = source[i];
    if (c === "\\") i += 1;
    else if (c === quote) return i;
    else if (c === "\n" && quote !== "`") return -1;
    else if (quote === "`" && c === "$" && source[i + 1] === "{") i = skipPlaceholder(source, i + 1);
  }
  return -1;
}

/** Index of the `}` that closes the placeholder opened at `open`. */
function skipPlaceholder(source: string, open: number): number {
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}" && (depth -= 1) === 0) return i;
  }
  return source.length;
}

/** Template literal: the text around `${}` is classes when the literal is, and the placeholders are code. */
function migrateTemplate(body: string, inClass: boolean): string {
  let out = "";
  let i = 0;
  while (i < body.length) {
    const open = body.indexOf("${", i);
    const text = body.slice(i, open < 0 ? body.length : open);
    out += inClass ? migrateClasses(text) : text;
    if (open < 0) break;
    const close = skipPlaceholder(body, open + 1);
    out += `\${${migrateTheme(body.slice(open + 2, close))}}`;
    i = close + 1;
  }
  return out;
}

/** Classes the codemod cannot map exactly and leaves for a manual decision. */
export function codemodWarnings(source: string): string[] {
  return [...source.matchAll(SCRIM)].map(([cls]) => `${cls}: scrim left untouched, pick a backdrop token by hand`);
}
