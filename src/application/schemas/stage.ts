import { z } from "zod";
import { idSchema } from "./common";

const name = z.string().trim().min(1).max(60);

export const createStageSchema = z.object({ pipelineId: idSchema, name, isDone: z.boolean().default(false) });
export const renameStageSchema = z.object({ stageId: idSchema, name });
export const reorderStageSchema = z.object({ stageId: idSchema, afterStageId: idSchema.nullable() });
export const setStageDoneSchema = z.object({ stageId: idSchema, isDone: z.boolean() });
export const deleteStageSchema = z.object({ stageId: idSchema, moveToStageId: idSchema.optional() });
