/** Route pattern of the Kanban page; revalidating it refreshes every pipeline page without trusting any id from the client. */
export const PIPELINE_PAGE = "/boards/[boardId]/pipelines/[pipelineId]";

/** Route pattern of the task detail page. */
export const TASK_PAGE = "/boards/[boardId]/pipelines/[pipelineId]/tasks/[taskId]";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Kanban path for two ids that came from a form; anything that is not a pair of UUIDs falls back to the board list. */
export function pipelinePath(boardId: string, pipelineId: string): string {
  return UUID.test(boardId) && UUID.test(pipelineId) ? `/boards/${boardId}/pipelines/${pipelineId}` : "/boards";
}
