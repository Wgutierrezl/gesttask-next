export const BOARD_STATUSES = ["active", "inactive"] as const;
export type BoardStatus = (typeof BOARD_STATUSES)[number];

export function isBoardStatus(value: unknown): value is BoardStatus {
  return typeof value === "string" && (BOARD_STATUSES as readonly string[]).includes(value);
}
