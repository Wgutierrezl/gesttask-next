import { describe, expect, it } from "vitest";
import { ValidationError } from "../errors";
import {
  MAX_POSITION_LENGTH,
  comparePositions,
  generateKeyBetween,
  generatePositions,
  isPosition,
} from "./position";

const LARGEST_INTEGER = `z${"z".repeat(26)}`;
const SMALLEST_INTEGER = `A${"0".repeat(26)}`;

describe("generateKeyBetween", () => {
  it("returns the first key when there are no neighbours", () => {
    expect(generateKeyBetween(null, null)).toBe("a0");
  });

  it("appends with integer increments and prepends with integer decrements", () => {
    expect(generateKeyBetween("a0", null)).toBe("a1");
    expect(generateKeyBetween("az", null)).toBe("b00");
    expect(generateKeyBetween("a0V", null)).toBe("a1");
    expect(generateKeyBetween(null, "a0")).toBe("Zz");
    expect(generateKeyBetween(null, "Zz")).toBe("Zy");
    expect(generateKeyBetween("Zz", null)).toBe("a0");
    expect(generateKeyBetween(null, "Z0")).toBe("Yzz");
    expect(generateKeyBetween(null, "a0V")).toBe("a0");
  });

  it("returns a key strictly between two neighbours", () => {
    expect(generateKeyBetween("a0", "a1")).toBe("a0V");
    expect(generateKeyBetween("a0", "a2")).toBe("a1");
    expect(generateKeyBetween("a0V", "a1")).toBe("a0l");
    expect(generateKeyBetween("a0", "a0V")).toBe("a0G");
    expect(generateKeyBetween("Zz", "a0")).toBe("ZzV");
  });

  it("handles shared prefixes and digit boundaries", () => {
    const key = generateKeyBetween("a0z", "a1");
    expect("a0z" < key && key < "a1").toBe(true);
    const nested = generateKeyBetween("a0V", "a0W");
    expect("a0V" < nested && nested < "a0W").toBe(true);
    expect(generateKeyBetween("a0", "a01")).toBe("a00V");
    expect(isPosition(generateKeyBetween("a0", "a01"))).toBe(true);
  });

  it("survives the integer-space limits on both ends", () => {
    const above = generateKeyBetween(LARGEST_INTEGER, null);
    expect(above > LARGEST_INTEGER && isPosition(above)).toBe(true);
    const nearFloor = `A${"0".repeat(25)}1`;
    const below = generateKeyBetween(null, nearFloor);
    expect(below < nearFloor && isPosition(below)).toBe(true);
    const underFloor = generateKeyBetween(null, `${SMALLEST_INTEGER}V`);
    expect(underFloor < `${SMALLEST_INTEGER}V` && isPosition(underFloor)).toBe(true);
    const crossing = generateKeyBetween("Zz", "b00");
    expect("Zz" < crossing && crossing < "b00").toBe(true);
  });

  it("rejects neighbours that are out of order, equal or malformed", () => {
    expect(() => generateKeyBetween("a1", "a0")).toThrow(ValidationError);
    expect(() => generateKeyBetween("a0", "a0")).toThrow(ValidationError);
    expect(() => generateKeyBetween("a00", null)).toThrow(ValidationError);
    expect(() => generateKeyBetween("!", null)).toThrow(ValidationError);
    expect(() => generateKeyBetween(null, "")).toThrow(ValidationError);
    expect(() => generateKeyBetween(SMALLEST_INTEGER, null)).toThrow(ValidationError);
    expect(() => generateKeyBetween("b0", null)).toThrow(ValidationError);
  });

  it("keeps a total order under repeated random insertions", () => {
    let seed = 42;
    const random = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const keys: string[] = [];
    for (let i = 0; i < 300; i++) {
      const at = Math.floor(random() * (keys.length + 1));
      keys.splice(at, 0, generateKeyBetween(keys[at - 1] ?? null, keys[at] ?? null));
    }
    expect(keys).toEqual([...keys].sort());
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("key growth bounds", () => {
  it("keeps 1000 sequential appends at 3 characters or fewer", () => {
    const keys: string[] = [];
    for (let i = 0; i < 1000; i++) keys.push(generateKeyBetween(keys.at(-1) ?? null, null));
    expect(keys).toEqual([...keys].sort());
    expect(new Set(keys).size).toBe(1000);
    expect(Math.max(...keys.map((k) => k.length))).toBeLessThanOrEqual(3);
  });

  it("keeps 1000 sequential prepends at 3 characters or fewer", () => {
    const keys: string[] = [];
    for (let i = 0; i < 1000; i++) keys.unshift(generateKeyBetween(null, keys[0] ?? null));
    expect(keys).toEqual([...keys].sort());
    expect(new Set(keys).size).toBe(1000);
    expect(Math.max(...keys.map((k) => k.length))).toBeLessThanOrEqual(3);
  });

  it("keeps 1000 inserts into the same gap ordered, growing about one character per six inserts (169 measured)", () => {
    const left = "a0";
    const inserted: string[] = [];
    for (let i = 0; i < 1000; i++) inserted.unshift(generateKeyBetween(left, inserted[0] ?? "a1"));
    const all = [left, ...inserted, "a1"];
    expect(all).toEqual([...all].sort());
    expect(new Set(all).size).toBe(all.length);
    expect(Math.max(...all.map((k) => k.length))).toBeLessThanOrEqual(200);
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

  it("produces short evenly-spread keys even for large columns", () => {
    const keys = generatePositions(1000);
    expect(keys).toEqual([...keys].sort());
    expect(Math.max(...keys.map((k) => k.length))).toBeLessThanOrEqual(3);
    expect(keys.slice(0, 3)).toEqual(["a0", "a1", "a2"]);
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

describe("MAX_POSITION_LENGTH", () => {
  it("is far above any freshly generated key", () => {
    expect(MAX_POSITION_LENGTH).toBe(32);
    expect(generatePositions(100_000).at(-1)!.length).toBeLessThan(MAX_POSITION_LENGTH);
  });
});
