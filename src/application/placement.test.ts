import { describe, expect, it } from "vitest";
import { NotFoundError } from "@/domain/errors";
import { MAX_POSITION_LENGTH, generatePositions } from "@/domain/value-objects/position";
import { placeAfter, placeAtEnd } from "./placement";

interface Item {
  id: string;
  position: string;
}
const column = (count: number): Item[] => generatePositions(count).map((position, i) => ({ id: `i${i}`, position }));
const order = (items: Item[]) => [...items].sort((a, b) => (a.position < b.position ? -1 : 1));
const sorted = (items: Item[]) => order(items).map((i) => i.id);

describe("placeAfter", () => {
  it("places at the top, in the middle and at the end without touching siblings", () => {
    const items = column(3);
    const top = placeAfter(items, null);
    const middle = placeAfter(items, "i0");
    const end = placeAfter(items, "i2");
    expect(top.position < items[0]!.position).toBe(true);
    expect(items[0]!.position < middle.position && middle.position < items[1]!.position).toBe(true);
    expect(end.position > items[2]!.position).toBe(true);
    expect([top, middle, end].map((p) => p.relocated)).toEqual([[], [], []]);
  });

  it("answers NotFound for an anchor outside the siblings", () => {
    expect(() => placeAfter(column(2), "ghost")).toThrow(NotFoundError);
  });

  it("rebalances when neighbours collide, returning the relocated siblings", () => {
    const items: Item[] = [
      { id: "a", position: "a0" },
      { id: "b", position: "a0" },
    ];
    const placed = placeAfter(items, "a");
    expect(placed.relocated.map((i) => i.id)).toEqual(["a", "b"]);
    const next = [...placed.relocated, { id: "m", position: placed.position }];
    expect(sorted(next)).toEqual(["a", "m", "b"]);
  });

  it("keeps order and bounds key length over 1000 inserts into the same gap", () => {
    let items = column(2);
    let rebalances = 0;
    for (let i = 0; i < 1000; i++) {
      const placed = placeAfter(items, "i0");
      if (placed.relocated.length > 0) {
        rebalances++;
        items = placed.relocated;
      }
      items = order([...items, { id: `n${i}`, position: placed.position }]);
      expect(Math.max(...items.map((it) => it.position.length))).toBeLessThanOrEqual(MAX_POSITION_LENGTH);
    }
    const expected = ["i0", ...Array.from({ length: 1000 }, (_, i) => `n${999 - i}`), "i1"];
    expect(sorted(items)).toEqual(expected);
    expect(new Set(items.map((i) => i.position)).size).toBe(items.length);
    expect(rebalances).toBeGreaterThan(0);
    expect(rebalances).toBeLessThan(50);
  });

  it("keeps order and short keys over 1000 prepends and 1000 appends", () => {
    let items: Item[] = [];
    for (let i = 0; i < 1000; i++) {
      items = [{ id: `p${i}`, position: placeAfter(items, null).position }, ...items];
      items = [...items, { id: `q${i}`, position: placeAtEnd(items).position }];
    }
    expect(sorted(items)).toEqual(items.map((i) => i.id));
    expect(Math.max(...items.map((i) => i.position.length))).toBeLessThanOrEqual(4);
  });
});
