import { z } from "zod";
import { idSchema, paginationSchema } from "./common";

const name = z.string().trim().min(1).max(100);
const description = z.string().max(2000);

export const createPipelineSchema = z.object({ boardId: idSchema, name, description: description.default("") });
export const updatePipelineSchema = z.object({
  pipelineId: idSchema,
  name: name.optional(),
  description: description.optional(),
});
export const pipelineIdSchema = z.object({ pipelineId: idSchema });
export const listStagesSchema = paginationSchema.extend({ pipelineId: idSchema });
