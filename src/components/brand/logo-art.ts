/** Single source of the brand mark geometry (viewBox 0 0 64 64). Fixed colors: the mark never follows the theme. */
export const MARK_FROM = "#2563eb";
export const MARK_TO = "#4f46e5";
export const COLUMNS = [11, 26, 41].map((x) => ({ x, y: 13, width: 12, height: 38, rx: 4 }));
export const CARDS = ([[13, 16], [13, 25], [13, 34], [28, 16], [28, 25]] as const).map(([x, y]) => ({ x, y, width: 8, height: 6, rx: 2 }));
export const BADGE = { cx: 47, cy: 22, r: 6 };
export const CHECK = "M44.2 22.2l2 2 3.8-4";

const rect = (r: { x: number; y: number; width: number; height: number; rx: number }) =>
  `<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" rx="${r.rx}"/>`;

/** The mark as a standalone SVG document. `rounded: false` gives the full-bleed square iOS wants for touch icons. */
export function logoSvg({ rounded = true, gradientId = "g" } = {}): string {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">`,
    `<defs><linearGradient id="${gradientId}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${MARK_FROM}"/><stop offset="1" stop-color="${MARK_TO}"/></linearGradient></defs>`,
    `<rect width="64" height="64"${rounded ? ' rx="16"' : ""} fill="url(#${gradientId})"/>`,
    `<g fill="#fff" opacity=".22">${COLUMNS.map(rect).join("")}</g>`,
    `<g fill="#fff" opacity=".85">${CARDS.map(rect).join("")}</g>`,
    `<circle cx="${BADGE.cx}" cy="${BADGE.cy}" r="${BADGE.r}" fill="#fff"/>`,
    `<path d="${CHECK}" fill="none" stroke="${MARK_TO}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    `</svg>`,
  ].join("");
}
