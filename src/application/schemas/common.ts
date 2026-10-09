import { z } from "zod";

export const idSchema = z.uuid();
/** Auth-provider user ids are opaque strings, not UUIDs. */
export const userIdSchema = z.string().min(1).max(128);

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  offset: z.coerce.number().int().min(0).default(0),
});
