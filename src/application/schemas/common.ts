import { z } from "zod";

export const idSchema = z.uuid();
/** Auth-provider user ids are opaque strings, not UUIDs. */
export const userIdSchema = z.string().min(1).max(128);

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;
/**
 * What a use case accepts as `limit`: the public maximum plus ONE peek row. The REST layer asks for a row more than the page to
 * know whether another page exists (so the last page never carries a cursor to an empty one), including at the maximum page size.
 * The public ceiling (MAX_PAGE_SIZE) is enforced where a client states a limit: the OpenAPI query schema.
 */
export const MAX_FETCH_SIZE = MAX_PAGE_SIZE + 1;

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_FETCH_SIZE).default(DEFAULT_PAGE_SIZE),
  offset: z.coerce.number().int().min(0).default(0),
});
