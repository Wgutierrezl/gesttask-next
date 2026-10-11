import { describe, expect, it } from "vitest";
import { collideBoard } from "@/components/kanban/collision";

const box = (left: number, top: number, width: number, height: number) => ({ left, top, width, height, right: left + width, bottom: top + height });
const container = (id: string) => ({ id, rect: { current: null }, disabled: false, node: { current: null }, data: { current: {} } });
const args = (pointer: { x: number; y: number } | null, dragged = box(0, 0, 10, 10)) =>
  ({
    active: { id: "a" },
    collisionRect: dragged,
    droppableRects: new Map([
      ["pipeline:p2", box(0, 0, 100, 40)],
      ["column:todo", box(0, 30, 300, 400)], // starts under the tab strip: they overlap by 10px
    ]),
    droppableContainers: [container("pipeline:p2"), container("column:todo")],
    pointerCoordinates: pointer,
  }) as never;
const ids = (hits: { id: string | number }[]) => hits.map((hit) => String(hit.id));

describe("collideBoard", () => {
  it("picks a tab only while the pointer is really inside it", () => {
    expect(ids(collideBoard(args({ x: 50, y: 20 })))).toEqual(["pipeline:p2"]);
  });

  it("never lets a card dropped near the top of a column land on a tab", () => {
    // Pointer is below the tab, but the dragged card's corners are closest to the tab's.
    expect(ids(collideBoard(args({ x: 50, y: 60 }, box(40, 35, 10, 10))))).toEqual(["column:todo"]);
  });

  it("falls back to columns and cards when there is no pointer (the keyboard sensor)", () => {
    expect(ids(collideBoard(args(null)))).toEqual(["column:todo"]);
  });
});
