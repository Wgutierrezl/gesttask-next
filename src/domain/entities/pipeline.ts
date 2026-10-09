export interface Pipeline {
  id: string;
  boardId: string;
  name: string;
  description: string;
}

/**
 * `boardId` is denormalized by the repository so authorization never needs a second lookup.
 * `isDone` marks the stage whose tasks count as completed; at most one per pipeline (REQ-TSK-05).
 */
export interface Stage {
  id: string;
  pipelineId: string;
  boardId: string;
  name: string;
  isDone: boolean;
  position: string;
}

/**
 * Stages every new pipeline starts with. Names stay in English in the domain; the UI localizes them.
 * The UI should also suggest `isDone` (never force it) for stages named done/completed/completada/hecho.
 */
export const DEFAULT_STAGES: readonly { name: string; isDone: boolean }[] = [
  { name: "To do", isDone: false },
  { name: "In progress", isDone: false },
  { name: "Done", isDone: true },
];
