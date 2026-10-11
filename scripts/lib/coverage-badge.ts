/** Green from the 90% gate that `pnpm test:coverage` enforces; amber down to 75%; red below. */
export function badgeColor(percent: number): string {
  if (percent >= 90) return "#2ea043";
  if (percent >= 75) return "#d29922";
  return "#cf222e";
}

/** The `lines` percentage of a vitest `json-summary` report. Throws when the report has none (a silent 0 would lie). */
export function linesPercent(summary: unknown): number {
  const pct = (summary as { total?: { lines?: { pct?: unknown } } } | null)?.total?.lines?.pct;
  if (typeof pct !== "number" || !Number.isFinite(pct) || pct < 0 || pct > 100) {
    throw new Error("The coverage summary has no usable total.lines.pct: run `pnpm test:coverage` first");
  }
  return pct;
}

const escapeXml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Approximate width of text in the 11px Verdana-like font of the badge; padded on both sides. */
const textWidth = (text: string) => Math.round(text.length * 6.6) + 12;

/** A flat two-part badge, self-contained (no fonts, links or scripts), so the README never depends on a badge service. */
export function renderBadge(label: string, percent: number): string {
  const value = `${(Math.round(percent * 10) / 10).toFixed(1)}%`;
  const [labelBox, valueBox] = [textWidth(label), textWidth(value)];
  const width = labelBox + valueBox;
  const name = escapeXml(label);
  const text = `${name}: ${value}`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="20" role="img" aria-label="${text}">`,
    `<title>${text}</title>`,
    `<rect width="${labelBox}" height="20" fill="#555"/>`,
    `<rect x="${labelBox}" width="${valueBox}" height="20" fill="${badgeColor(percent)}"/>`,
    `<g fill="#fff" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11" text-anchor="middle">`,
    `<text x="${labelBox / 2}" y="14">${name}</text>`,
    `<text x="${labelBox + valueBox / 2}" y="14">${value}</text>`,
    `</g>`,
    `</svg>`,
    ``,
  ].join("\n");
}
