import { z } from "zod";
import { idSchema } from "./common";

/**
 * Stored composed (NFC), so "e" + combining accent and "é" are one name to the unique index. A blank name has its own message and
 * reason (`stageName.required`) instead of Zod's generic length wording, so every form can show it the same way.
 */
const name = z
  .string()
  .trim()
  .normalize("NFC")
  .max(60)
  .refine((value) => value.length > 0, { message: "Stage name is required", params: { reason: "stageName.required" } });
export const stageNameSchema = name;

/** What two stage names are compared by: the same fold the unique index applies (`lower(name)`), on names already NFC. */
export const stageNameKey = (stageName: string): string => stageName.toLowerCase();

export const stageIdSchema = z.object({ stageId: idSchema });
export const createStageSchema = z.object({ pipelineId: idSchema, name, isDone: z.boolean().default(false) });
export const renameStageSchema = z.object({ stageId: idSchema, name });
export const reorderStageSchema = z.object({ stageId: idSchema, afterStageId: idSchema.nullable() });
export const setStageDoneSchema = z.object({ stageId: idSchema, isDone: z.boolean() });
export const deleteStageSchema = z.object({ stageId: idSchema, moveToStageId: idSchema.optional() });
