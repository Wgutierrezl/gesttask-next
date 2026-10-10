import { z } from "zod";
import { BOARD_STATUSES } from "@/domain/value-objects/board-status";
import { idSchema, MAX_PAGE_SIZE, paginationSchema, userIdSchema } from "./common";

const name = z.string().trim().min(1, "Name is required").max(100, "Name must be at most 100 characters");
const description = z.string().max(2000, "Description must be at most 2000 characters");

export const createBoardSchema = z.object({ name, description: description.default("") });

export const updateBoardSchema = z.object({
  boardId: idSchema,
  name: name.optional(),
  description: description.optional(),
  status: z.enum(BOARD_STATUSES).optional(),
});

export const boardIdSchema = z.object({ boardId: idSchema });

/** Page of the actor's own boards; there is deliberately no user id to aim at someone else. */
export const listMyBoardsSchema = paginationSchema;
export const listByBoardSchema = paginationSchema.extend({ boardId: idSchema });
/** Member directory page, or just the given users (a page of cards on screen) when `userIds` is present. */
export const listMemberProfilesSchema = listByBoardSchema.extend({ userIds: z.array(userIdSchema).max(MAX_PAGE_SIZE).optional() });
