import { z } from "zod";
import { PRIORITIES } from "@/domain/value-objects/priority";
import { TASK_STATUSES } from "@/domain/value-objects/task-status";
import { idSchema, paginationSchema, userIdSchema } from "./common";

const title = z.string().trim().min(1).max(120);
const description = z.string().max(5000);
const priority = z.enum(PRIORITIES);
const dueDate = z.iso.date();

export const createTaskSchema = z.object({
  stageId: idSchema,
  title,
  description: description.default(""),
  priority: priority.default("medium"),
  dueDate: dueDate.nullable().default(null),
  assigneeId: userIdSchema.nullable().default(null),
});

export const updateTaskSchema = z.object({
  taskId: idSchema,
  title: title.optional(),
  description: description.optional(),
  priority: priority.optional(),
  status: z.enum(TASK_STATUSES).optional(),
  dueDate: dueDate.nullable().optional(),
  assigneeId: userIdSchema.nullable().optional(),
});

export const taskIdSchema = z.object({ taskId: idSchema });
export const listTasksByPipelineSchema = paginationSchema.extend({ pipelineId: idSchema });
