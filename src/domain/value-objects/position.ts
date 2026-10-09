import { ValidationError } from "../errors";

// Fractional indexing over base62 digits, ordered by code point (matches COLLATE "C" in Postgres).
// Same scheme as the `fractional-indexing` package, kept in-house because domain cannot depend on
// npm packages. A key is a length-prefixed integer part followed by an optional fractional part:
// the head letter encodes the integer's length ("a" = 2 chars, "b" = 3, ... "z" = 27; "Z" = 2 chars
// for negatives, "Y" = 3, ... "A" = 27), so appending or prepending only ever touches the integer
// and keys stay short (62 + 62^2 keys fit in 3 characters). Fractional parts never end in the zero
// digit, which keeps every key reachable by `generateKeyBetween`.
const DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const ZERO = DIGITS[0] as string;
const LAST = DIGITS[DIGITS.length - 1] as string;
const SMALLEST_INTEGER = `A${ZERO.repeat(26)}`;

/**
 * Longest key the application keeps in storage. Repeated inserts into one gap grow the fractional
 * part; callers rebalance the column (see `generatePositions`) before a key would exceed this.
 */
export const MAX_POSITION_LENGTH = 32;

function integerLength(head: string): number {
  if (head >= "a" && head <= "z") return head.charCodeAt(0) - 95;
  if (head >= "A" && head <= "Z") return 92 - head.charCodeAt(0);
  return 0;
}

export function isPosition(value: string): boolean {
  const length = integerLength(value[0] ?? "");
  return (
    length > 0 &&
    length <= value.length &&
    value !== SMALLEST_INTEGER &&
    !(value.length > length && value.endsWith(ZERO)) &&
    [...value.slice(1)].every((c) => DIGITS.includes(c))
  );
}

export function comparePositions(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function splitKey(key: string): [integer: string, fraction: string] {
  const length = integerLength(key[0] as string);
  return [key.slice(0, length), key.slice(length)];
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

/** Next integer part, or null when `integer` is already the largest one. */
function incrementInteger(integer: string): string | null {
  const head = integer[0] as string;
  const digits = [...integer.slice(1)];
  let carry = true;
  for (let i = digits.length - 1; carry && i >= 0; i--) {
    const next = DIGITS.indexOf(digits[i] as string) + 1;
    digits[i] = next === DIGITS.length ? ZERO : (DIGITS[next] as string);
    carry = next === DIGITS.length;
  }
  if (!carry) return head + digits.join("");
  if (head === "Z") return `a${ZERO}`;
  if (head === "z") return null;
  const nextHead = String.fromCharCode(head.charCodeAt(0) + 1);
  if (nextHead > "a") digits.push(ZERO);
  else digits.pop();
  return nextHead + digits.join("");
}

/** Previous integer part; callers guarantee `integer` is above the smallest one. */
function decrementInteger(integer: string): string {
  const head = integer[0] as string;
  const digits = [...integer.slice(1)];
  let borrow = true;
  for (let i = digits.length - 1; borrow && i >= 0; i--) {
    const previous = DIGITS.indexOf(digits[i] as string) - 1;
    digits[i] = previous < 0 ? LAST : (DIGITS[previous] as string);
    borrow = previous < 0;
  }
  if (!borrow) return head + digits.join("");
  if (head === "a") return `Z${LAST}`;
  const nextHead = String.fromCharCode(head.charCodeAt(0) - 1);
  if (nextHead < "Z") digits.push(LAST);
  else digits.pop();
  return nextHead + digits.join("");
}

function keyBefore(after: string): string {
  const [integer, fraction] = splitKey(after);
  if (integer === SMALLEST_INTEGER) return integer + midpoint("", fraction);
  if (integer < after) return integer;
  const previous = decrementInteger(integer);
  return previous === SMALLEST_INTEGER ? previous + midpoint("", null) : previous;
}

function keyAfter(before: string): string {
  const [integer, fraction] = splitKey(before);
  return incrementInteger(integer) ?? integer + midpoint(fraction, null);
}

/** Returns a key strictly between `before` and `after`; null means "no neighbour on that side". */
export function generateKeyBetween(before: string | null, after: string | null): string {
  for (const key of [before, after]) {
    if (key !== null && !isPosition(key)) throw new ValidationError(`Invalid position key: "${key}"`);
  }
  if (before !== null && after !== null && before >= after) {
    throw new ValidationError("Position neighbours are out of order");
  }
  if (before === null) return after === null ? `a${ZERO}` : keyBefore(after);
  if (after === null) return keyAfter(before);
  const [integerA, fractionA] = splitKey(before);
  const [integerB, fractionB] = splitKey(after);
  if (integerA === integerB) return integerA + midpoint(fractionA, fractionB);
  const next = incrementInteger(integerA);
  return next !== null && next < after ? next : integerA + midpoint(fractionA, null);
}

/** Short, strictly increasing keys; used to seed or rebalance a column. */
export function generatePositions(count: number): string[] {
  const keys: string[] = [];
  let last: string | null = null;
  for (let i = 0; i < count; i++) {
    last = generateKeyBetween(last, null);
    keys.push(last);
  }
  return keys;
}
