import { z } from "zod";

export const idSchema = z.uuid();
/** Auth-provider user ids are opaque strings, not UUIDs. */
export const userIdSchema = z.string().min(1).max(128);

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;
export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  offset: z.coerce.number().int().min(0).default(0),
  /**
   * Ask for ONE row beyond the page. The REST layer does, to know whether another page exists (so the last page never carries a
   * cursor to an empty one), including at the maximum page size. It is a flag and not a wider `limit`, so no caller can state a
   * page larger than MAX_PAGE_SIZE; with the flag the answer holds at most limit + 1 rows.
   */
  peek: z.boolean().optional(),
});

/** What the repositories are asked for: the page, plus the peek row when requested. */
export const pageWindow = ({ limit, offset, peek }: { limit: number; offset: number; peek?: boolean }) => ({
  limit: peek ? limit + 1 : limit,
  offset,
});
