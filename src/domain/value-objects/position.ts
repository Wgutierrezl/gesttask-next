import { ValidationError } from "../errors";

// Fractional indexing over base62 digits, ordered by code point (matches COLLATE "C" in Postgres).
// Same midpoint algorithm as the `fractional-indexing` package, kept in-house because domain
// cannot depend on npm packages. Keys are non-empty and never end with the zero digit.
const DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const ZERO = DIGITS[0] as string;

export function isPosition(value: string): boolean {
  return value.length > 0 && !value.endsWith(ZERO) && [...value].every((c) => DIGITS.includes(c));
}

export function comparePositions(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function midpoint(a: string, b: string | null): string {
  if (b !== null) {
    let n = 0;
    while ((a[n] ?? ZERO) === b[n]) n++;
    if (n > 0) return b.slice(0, n) + midpoint(a.slice(n), b.slice(n));
  }
  const digitA = a ? DIGITS.indexOf(a[0] as string) : 0;
  const digitB = b !== null ? DIGITS.indexOf(b[0] as string) : DIGITS.length;
  if (digitB - digitA > 1) return DIGITS[Math.round(0.5 * (digitA + digitB))] as string;
  if (b !== null && b.length > 1) return b.slice(0, 1);
  return (DIGITS[digitA] as string) + midpoint(a.slice(1), null);
}

/** Returns a key strictly between `before` and `after`; null means "no neighbour on that side". */
export function generateKeyBetween(before: string | null, after: string | null): string {
  for (const key of [before, after]) {
    if (key !== null && !isPosition(key)) throw new ValidationError(`Invalid position key: "${key}"`);
  }
  if (before !== null && after !== null && before >= after) {
    throw new ValidationError("Position neighbours are out of order");
  }
  return midpoint(before ?? "", after);
}

/** Evenly usable, strictly increasing keys; used to seed or rebalance a column. */
export function generatePositions(count: number): string[] {
  const keys: string[] = [];
  let last: string | null = null;
  for (let i = 0; i < count; i++) {
    last = generateKeyBetween(last, null);
    keys.push(last);
  }
  return keys;
}
