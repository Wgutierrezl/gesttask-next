import { z } from "zod";
import { idSchema, paginationSchema } from "./common";

const name = z.string().trim().min(1, "Name is required").max(100, "Name must be at most 100 characters");
const description = z.string().max(2000, "Description must be at most 2000 characters");

export const createPipelineSchema = z.object({ boardId: idSchema, name, description: description.default("") });
export const updatePipelineSchema = z.object({
  pipelineId: idSchema,
  name: name.optional(),
  description: description.optional(),
});
export const pipelineIdSchema = z.object({ pipelineId: idSchema });
export const listStagesSchema = paginationSchema.extend({ pipelineId: idSchema });
