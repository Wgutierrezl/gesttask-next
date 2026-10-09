import { describe, expect, it } from "vitest";
import { ValidationError } from "../errors";
import { comparePositions, generateKeyBetween, generatePositions, isPosition } from "./position";

describe("generateKeyBetween", () => {
  it("returns a valid key when there are no neighbours", () => {
    const key = generateKeyBetween(null, null);
    expect(isPosition(key)).toBe(true);
  });

  it("appends after the last key and prepends before the first", () => {
    const mid = generateKeyBetween(null, null);
    expect(comparePositions(generateKeyBetween(mid, null), mid)).toBeGreaterThan(0);
    expect(comparePositions(generateKeyBetween(null, mid), mid)).toBeLessThan(0);
  });

  it("returns a key strictly between two neighbours", () => {
    const a = "V";
    const b = "W";
    const key = generateKeyBetween(a, b);
    expect(a < key && key < b).toBe(true);
  });

  it("handles the digit boundaries and shared prefixes", () => {
    expect(generateKeyBetween("1", null) > "1").toBe(true);
    expect(generateKeyBetween(null, "1") < "1").toBe(true);
    expect(generateKeyBetween(null, "0V") < "0V").toBe(true);
    const key = generateKeyBetween("Vz", "W0V");
    expect("Vz" < key && key < "W0V").toBe(true);
    expect(generateKeyBetween("zzz", null) > "zzz").toBe(true);
  });

  it("rejects neighbours that are out of order, equal or malformed", () => {
    expect(() => generateKeyBetween("b", "a")).toThrow(ValidationError);
    expect(() => generateKeyBetween("a", "a")).toThrow(ValidationError);
    expect(() => generateKeyBetween("a0", null)).toThrow(ValidationError);
    expect(() => generateKeyBetween("!", null)).toThrow(ValidationError);
    expect(() => generateKeyBetween(null, "")).toThrow(ValidationError);
  });

  it("keeps a total order under repeated random insertions", () => {
    let seed = 42;
    const random = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const keys: string[] = [];
    for (let i = 0; i < 300; i++) {
      const at = Math.floor(random() * (keys.length + 1));
      const key = generateKeyBetween(keys[at - 1] ?? null, keys[at] ?? null);
      keys.splice(at, 0, key);
    }
    expect(keys).toEqual([...keys].sort());
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("generatePositions", () => {
  it("creates n strictly increasing valid keys", () => {
    const keys = generatePositions(25);
    expect(keys).toHaveLength(25);
    expect(keys).toEqual([...keys].sort());
    expect(new Set(keys).size).toBe(25);
    expect(keys.every(isPosition)).toBe(true);
  });

  it("returns an empty list for zero", () => {
    expect(generatePositions(0)).toEqual([]);
  });
});

describe("comparePositions", () => {
  it("orders by code point, not locale", () => {
    expect(comparePositions("Z", "a")).toBeLessThan(0);
    expect(comparePositions("a", "a")).toBe(0);
    expect(comparePositions("b", "a")).toBeGreaterThan(0);
  });
});
