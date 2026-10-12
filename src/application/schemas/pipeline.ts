import { z } from "zod";
import { MAX_INITIAL_STAGES } from "../stage-limits";
import { idSchema, paginationSchema } from "./common";
import { stageNameSchema } from "./stage";

const name = z.string().trim().min(1, "Name is required").max(100, "Name must be at most 100 characters");
const description = z.string().max(2000, "Description must be at most 2000 characters");

/** The stages a new pipeline starts with, in order; omitted means the defaults. Names are unique ignoring case. */
const initialStages = z
  .array(stageNameSchema)
  .min(1, "A pipeline needs at least one stage")
  .max(MAX_INITIAL_STAGES, `A pipeline can have at most ${MAX_INITIAL_STAGES} stages`)
  .refine((names) => new Set(names.map((n) => n.toLowerCase())).size === names.length, "Stage names must be unique");

export const createPipelineSchema = z.object({ boardId: idSchema, name, description: description.default(""), stages: initialStages.optional() });
export const updatePipelineSchema = z.object({
  pipelineId: idSchema,
  name: name.optional(),
  description: description.optional(),
});
export const pipelineIdSchema = z.object({ pipelineId: idSchema });
export const listStagesSchema = paginationSchema.extend({ pipelineId: idSchema });
