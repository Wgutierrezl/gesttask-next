import { boardIdSchema } from "@/application/schemas/board";
import { createPipelineSchema, pipelineIdSchema, updatePipelineSchema } from "@/application/schemas/pipeline";
import type { Operation } from "../operation";
import { pageQuery } from "../page-query";
import { pipelineResponse, pipelineWithRoleResponse } from "../responses";

export const pipelineOperations: Operation[] = [
  {
    id: "listPipelines", method: "get", path: "/boards/{boardId}/pipelines", tag: "Pipelines", summary: "List the pipelines of a board",
    params: boardIdSchema, query: pageQuery, response: { kind: "list", item: pipelineResponse, paginated: true },
  },
  {
    id: "createPipeline", method: "post", path: "/boards/{boardId}/pipelines", tag: "Pipelines",
    summary: "Create a pipeline with the default stages (owner)",
    params: boardIdSchema, body: createPipelineSchema.omit({ boardId: true }), response: { kind: "item", status: 201, schema: pipelineResponse },
  },
  {
    id: "getPipeline", method: "get", path: "/pipelines/{pipelineId}", tag: "Pipelines", summary: "Get a pipeline and your role on its board",
    params: pipelineIdSchema, response: { kind: "item", status: 200, schema: pipelineWithRoleResponse },
  },
  {
    id: "updatePipeline", method: "patch", path: "/pipelines/{pipelineId}", tag: "Pipelines", summary: "Rename or describe a pipeline (owner)",
    params: pipelineIdSchema, body: updatePipelineSchema.omit({ pipelineId: true }), response: { kind: "item", status: 200, schema: pipelineResponse },
  },
  {
    id: "deletePipeline", method: "delete", path: "/pipelines/{pipelineId}", tag: "Pipelines",
    summary: "Delete a pipeline with its stages, tasks, comments and attachments (owner)",
    params: pipelineIdSchema, response: { kind: "none" },
  },
];
