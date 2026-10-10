import { pipelineIdSchema } from "@/application/schemas/pipeline";
import { createStageSchema, deleteStageSchema, renameStageSchema, reorderStageSchema, setStageDoneSchema, stageIdSchema } from "@/application/schemas/stage";
import type { Operation } from "../operation";
import { pageQuery } from "../page-query";
import { stageResponse } from "../responses";

export const stageOperations: Operation[] = [
  {
    id: "listStages", method: "get", path: "/pipelines/{pipelineId}/stages", tag: "Stages", summary: "List the stages of a pipeline in board order",
    params: pipelineIdSchema, query: pageQuery, response: { kind: "list", item: stageResponse, paginated: true },
  },
  {
    id: "createStage", method: "post", path: "/pipelines/{pipelineId}/stages", tag: "Stages", summary: "Add a stage at the end of a pipeline (owner)",
    params: pipelineIdSchema, body: createStageSchema.omit({ pipelineId: true }), response: { kind: "item", status: 201, schema: stageResponse },
  },
  {
    id: "renameStage", method: "patch", path: "/stages/{stageId}", tag: "Stages", summary: "Rename a stage (owner)",
    params: stageIdSchema, body: renameStageSchema.omit({ stageId: true }), response: { kind: "item", status: 200, schema: stageResponse },
  },
  {
    id: "setStageDone", method: "post", path: "/stages/{stageId}/done", tag: "Stages",
    summary: "Flag or unflag the stage whose tasks count as completed (owner)",
    params: stageIdSchema, body: setStageDoneSchema.omit({ stageId: true }), response: { kind: "item", status: 200, schema: stageResponse },
  },
  {
    id: "reorderStage", method: "post", path: "/stages/{stageId}/reorder", tag: "Stages",
    summary: "Move a stage right after another one, or to the start with afterStageId null (owner)",
    params: stageIdSchema, body: reorderStageSchema.omit({ stageId: true }), response: { kind: "item", status: 200, schema: stageResponse },
  },
  {
    id: "deleteStage", method: "delete", path: "/stages/{stageId}", tag: "Stages",
    summary: "Delete a stage; a stage with tasks needs moveToStageId to receive them (owner)",
    params: stageIdSchema, query: deleteStageSchema.pick({ moveToStageId: true }), response: { kind: "none" },
  },
];
