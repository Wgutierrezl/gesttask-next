import { describe, expect, it } from "vitest";
import { BOARD_ACTIONS, can, type BoardAction } from "./board-policy";
import type { BoardRole } from "../value-objects/board-role";

// Approved permission matrix (REQ-BRD-06). A missing row or a changed cell fails loudly.
const MATRIX: Record<BoardAction, readonly [owner: boolean, member: boolean, guest: boolean]> = {
  "board:view": [true, true, true],
  "board:update": [true, false, false],
  "board:delete": [true, false, false],
  "member:manage": [true, false, false],
  "pipeline:manage": [true, false, false],
  "task:write": [true, true, false],
  "comment:create": [true, true, true],
  "comment:modify-own": [true, true, true],
  "comment:moderate": [true, false, false],
  "attachment:create": [true, true, false],
};

const ROLES: readonly BoardRole[] = ["owner", "member", "guest"];

describe("can(role, action)", () => {
  it("covers every action in the matrix and nothing else", () => {
    expect(Object.keys(MATRIX).sort()).toEqual([...BOARD_ACTIONS].sort());
  });

  it.each(BOARD_ACTIONS.flatMap((action) => ROLES.map((role, i) => [role, action, MATRIX[action][i]] as const)))(
    "%s + %s => %s",
    (role, action, expected) => {
      expect(can(role, action)).toBe(expected);
    },
  );
});
