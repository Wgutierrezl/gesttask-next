export const BOARD_ROLES = ["owner", "member", "guest"] as const;
export type BoardRole = (typeof BOARD_ROLES)[number];

export function isBoardRole(value: unknown): value is BoardRole {
  return typeof value === "string" && (BOARD_ROLES as readonly string[]).includes(value);
}
