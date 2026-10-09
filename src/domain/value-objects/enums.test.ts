import { describe, expect, it } from "vitest";
import { BOARD_ROLES, isBoardRole } from "./board-role";
import { BOARD_STATUSES, isBoardStatus } from "./board-status";
import { PRIORITIES, isPriority } from "./priority";
import { TASK_STATUSES, isTaskStatus } from "./task-status";

// One canonical value set per enum, shared by domain, DB, UI and REST (REQ-TSK-01).
describe.each([
  ["Priority", PRIORITIES, isPriority, ["low", "medium", "high"], ["alta", "High", "", "urgent"]],
  ["TaskStatus", TASK_STATUSES, isTaskStatus, ["active", "inactive"], ["done", "Active", ""]],
  ["BoardRole", BOARD_ROLES, isBoardRole, ["owner", "member", "guest"], ["admin", "OWNER", ""]],
  ["BoardStatus", BOARD_STATUSES, isBoardStatus, ["active", "inactive"], ["archived", ""]],
] as const)("%s enum contract", (_name, values, guard, expected, rejected) => {
  it("exposes exactly the canonical values", () => {
    expect([...values]).toEqual(expected);
  });

  it.each(expected)("accepts %s", (value) => {
    expect(guard(value)).toBe(true);
  });

  it.each(rejected)("rejects %j (v1 typo or alias)", (value) => {
    expect(guard(value)).toBe(false);
  });

  it("rejects non-string input", () => {
    expect(guard(undefined)).toBe(false);
    expect(guard(1)).toBe(false);
    expect(guard(null)).toBe(false);
  });
});
