import { z } from "zod";
import { BOARD_ROLES } from "@/domain/value-objects/board-role";
import { idSchema, userIdSchema } from "./common";

const role = z.enum(BOARD_ROLES);

export const addMemberSchema = z.object({ boardId: idSchema, userId: userIdSchema, role });
export const memberTargetSchema = z.object({ boardId: idSchema, userId: userIdSchema });
export const changeMemberRoleSchema = z.object({ boardId: idSchema, userId: userIdSchema, role });
