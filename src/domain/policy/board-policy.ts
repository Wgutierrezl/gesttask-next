import type { BoardRole } from "../value-objects/board-role";

export const BOARD_ACTIONS = [
  "board:view",
  "board:update",
  "board:delete",
  "member:manage",
  "pipeline:manage",
  "task:write",
  "comment:create",
  "comment:modify-own",
  "comment:moderate",
  "attachment:create",
] as const;
export type BoardAction = (typeof BOARD_ACTIONS)[number];

const OWNER_ONLY: readonly BoardRole[] = ["owner"];
const WRITERS: readonly BoardRole[] = ["owner", "member"];
const EVERYONE: readonly BoardRole[] = ["owner", "member", "guest"];

// Single source of truth for authorization (REQ-BRD-06). Non-members never reach this table:
// the application layer answers NotFound before asking.
const ALLOWED: Record<BoardAction, readonly BoardRole[]> = {
  "board:view": EVERYONE,
  "board:update": OWNER_ONLY,
  "board:delete": OWNER_ONLY,
  "member:manage": OWNER_ONLY,
  "pipeline:manage": OWNER_ONLY,
  "task:write": WRITERS,
  "comment:create": EVERYONE,
  "comment:modify-own": EVERYONE,
  "comment:moderate": OWNER_ONLY,
  "attachment:create": WRITERS,
};

export function can(role: BoardRole, action: BoardAction): boolean {
  return ALLOWED[action].includes(role);
}
