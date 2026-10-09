import { z } from "zod";
import { BOARD_STATUSES } from "@/domain/value-objects/board-status";
import { idSchema, paginationSchema } from "./common";

const name = z.string().trim().min(1).max(100);
const description = z.string().max(2000);

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
