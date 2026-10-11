import { z } from "zod";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "@/application/schemas/common";

/** Query of every paginated list: a page size and the opaque cursor a previous page returned as `nextCursor`. */
export const pageQuery = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  cursor: z.string().max(32).optional(),
});

/** How deep a client may page. OFFSET gets slower the further it goes, so the depth is bounded instead of letting a cursor name any row. */
export const MAX_OFFSET = 10_000;

const CURSOR_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;

/** The cursor is the offset of the next item, base64url encoded so clients treat it as opaque. */
export const encodeCursor = (offset: number): string => Buffer.from(String(offset)).toString("base64url");

/** `null` when the cursor was not made by `encodeCursor` or points beyond `MAX_OFFSET`. */
export function decodeCursor(cursor: string): number | null {
  if (!CURSOR_PATTERN.test(cursor)) return null;
  const text = Buffer.from(cursor, "base64url").toString();
  return /^\d{1,9}$/.test(text) && Number(text) <= MAX_OFFSET ? Number(text) : null;
}
