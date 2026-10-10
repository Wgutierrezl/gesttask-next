import { z } from "zod";
import { idSchema, paginationSchema } from "./common";

export const COMMENT_MAX_LENGTH = 2000;

const body = z.string().trim().min(1, "Write something first").max(COMMENT_MAX_LENGTH, `Comments are limited to ${COMMENT_MAX_LENGTH} characters`);

export const createCommentSchema = z.object({ taskId: idSchema, body });
export const editCommentSchema = z.object({ commentId: idSchema, body });
export const commentIdSchema = z.object({ commentId: idSchema });
export const listCommentsSchema = paginationSchema.extend({ taskId: idSchema });
