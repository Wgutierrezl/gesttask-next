import { z } from "zod";
import { BOARD_ROLES } from "@/domain/value-objects/board-role";
import { MAX_PAGE_SIZE, idSchema, userIdSchema } from "./common";

const role = z.enum(BOARD_ROLES);

export const addMemberSchema = z.object({ boardId: idSchema, userId: userIdSchema, role });
export const memberTargetSchema = z.object({ boardId: idSchema, userId: userIdSchema });
export const changeMemberRoleSchema = z.object({ boardId: idSchema, userId: userIdSchema, role });

/** Optional narrowing to the boards on screen; there is deliberately no user id to aim at someone else. */
export const listMyMembershipsSchema = z.object({ boardIds: z.array(idSchema).max(MAX_PAGE_SIZE).optional() });

export const addMemberByEmailSchema = z.object({
  boardId: idSchema,
  email: z.string().trim().toLowerCase().pipe(z.email()),
  role,
});
