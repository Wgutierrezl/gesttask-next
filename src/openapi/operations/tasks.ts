import { pipelineIdSchema } from "@/application/schemas/pipeline";
import { stageIdSchema } from "@/application/schemas/stage";
import { createTaskSchema, moveTaskFields, reorderTaskSchema, taskIdSchema, updateTaskSchema } from "@/application/schemas/task";
import type { Operation } from "../operation";
import { pageQuery } from "../page-query";
import { taskResponse } from "../responses";

export const taskOperations: Operation[] = [
  {
    id: "listTasksByPipeline", method: "get", path: "/pipelines/{pipelineId}/tasks", tag: "Tasks",
    summary: "List the tasks of a pipeline, column by column and in card order",
    params: pipelineIdSchema, query: pageQuery, response: { kind: "list", item: taskResponse, paginated: true },
  },
  {
    id: "createTask", method: "post", path: "/stages/{stageId}/tasks", tag: "Tasks", summary: "Create a task at the end of a stage (owner, member)",
    params: stageIdSchema, body: createTaskSchema.omit({ stageId: true }), response: { kind: "item", status: 201, schema: taskResponse },
  },
  {
    id: "getTask", method: "get", path: "/tasks/{taskId}", tag: "Tasks", summary: "Get a task",
    params: taskIdSchema, response: { kind: "item", status: 200, schema: taskResponse },
  },
  {
    id: "updateTask", method: "patch", path: "/tasks/{taskId}", tag: "Tasks", summary: "Edit a task's fields (owner, member)",
    params: taskIdSchema, body: updateTaskSchema.omit({ taskId: true }), response: { kind: "item", status: 200, schema: taskResponse },
  },
  {
    id: "deleteTask", method: "delete", path: "/tasks/{taskId}", tag: "Tasks", summary: "Delete a task with its comments and attachments (owner, member)",
    params: taskIdSchema, response: { kind: "none" },
  },
  {
    id: "moveTask", method: "post", path: "/tasks/{taskId}/move", tag: "Tasks",
    summary: "Move a task to a stage of its pipeline: right after afterTaskId (null = top of the column) or toEnd (exactly one of the two)",
    params: taskIdSchema, body: moveTaskFields.omit({ taskId: true }), response: { kind: "item", status: 200, schema: taskResponse },
  },
  {
    id: "reorderTask", method: "post", path: "/tasks/{taskId}/reorder", tag: "Tasks",
    summary: "Reorder a task inside its stage, right after afterTaskId (null = top)",
    params: taskIdSchema, body: reorderTaskSchema.omit({ taskId: true }), response: { kind: "item", status: 200, schema: taskResponse },
  },
];
