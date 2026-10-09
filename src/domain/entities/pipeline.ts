export interface Pipeline {
  id: string;
  boardId: string;
  name: string;
  description: string;
}

/** `boardId` is denormalized by the repository so authorization never needs a second lookup. */
export interface Stage {
  id: string;
  pipelineId: string;
  boardId: string;
  name: string;
  position: string;
}

/** The final stage (highest position) marks tasks as completed (REQ-TSK-05). */
export function isTerminalStage(stageId: string, stages: readonly Stage[]): boolean {
  let last: Stage | undefined;
  for (const stage of stages) {
    if (last === undefined || stage.position > last.position) last = stage;
  }
  return last !== undefined && last.id === stageId;
}
