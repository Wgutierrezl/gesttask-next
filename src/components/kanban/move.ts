import type { ColumnView, PipelineOption, TaskCardView } from "./types";

/**
 * What the server needs to place a task: the stage, and the task it goes after (null = top), or `toEnd` to let
 * the server resolve the last place itself. Clients never send positions.
 */
export interface MoveRequest {
  taskId: string;
  toStageId: string;
  afterTaskId: string | null;
  toEnd?: true;
}

/** Droppable ids of whole columns are prefixed so they can never collide with a task id. */
export const COLUMN_PREFIX = "column:";
export const columnId = (stageId: string) => `${COLUMN_PREFIX}${stageId}`;

/** The stage a droppable id belongs to: a column id names it, a card id names the stage that holds the card. */
export function stageOfDroppable(columns: ColumnView[], id: string): string | null {
  if (id.startsWith(COLUMN_PREFIX)) return id.slice(COLUMN_PREFIX.length);
  return columns.find((column) => column.tasks.some((task) => task.id === id))?.stage.id ?? null;
}

/**
 * The board as it will look once `move` succeeds, mirroring the server rules (completed in the done stage,
 * reopened anywhere else). `overdue` is left as the server last said: it depends on the server's date, so it
 * is only corrected by the refresh that follows. Returns the SAME array when the move cannot apply, so a stale
 * or invalid request never invents a state the server would reject. Never mutates its input.
 */
export function applyMove(columns: ColumnView[], move: MoveRequest, now: Date = new Date()): ColumnView[] {
  const source = columns.find((column) => column.tasks.some((task) => task.id === move.taskId));
  const target = columns.find((column) => column.stage.id === move.toStageId);
  const task = source?.tasks.find((candidate) => candidate.id === move.taskId);
  if (!source || !target || !task || move.afterTaskId === move.taskId) return columns;
  const rest = target.tasks.filter((candidate) => candidate.id !== task.id);
  const index = move.toEnd ? rest.length : move.afterTaskId === null ? 0 : rest.findIndex((candidate) => candidate.id === move.afterTaskId) + 1;
  if (!move.toEnd && move.afterTaskId !== null && index === 0) return columns;
  const moved: TaskCardView = {
    ...task,
    stageId: target.stage.id,
    completedAt: target.stage.isDone ? (task.completedAt ?? now.toISOString()) : null,
  };
  return columns.map((column) => {
    if (column.stage.id === target.stage.id) return { ...column, tasks: [...rest.slice(0, index), moved, ...rest.slice(index)] };
    if (column.stage.id === source.stage.id) return { ...column, tasks: column.tasks.filter((candidate) => candidate.id !== task.id) };
    return column;
  });
}

/** Where `taskId` currently sits: its column and index. */
function locate(columns: ColumnView[], taskId: string) {
  for (const column of columns) {
    const index = column.tasks.findIndex((task) => task.id === taskId);
    if (index >= 0) return { column, index };
  }
  return null;
}

/**
 * Turns a drag-and-drop result into a move. Dropping on a card places the task where that card is (array-move
 * semantics inside a column, before the card across columns); dropping on a column's open area appends.
 * Returns null when nothing would change.
 */
export function resolveDrop(columns: ColumnView[], activeId: string, overId: string): MoveRequest | null {
  const from = locate(columns, activeId);
  if (!from || activeId === overId) return null;
  let target: ColumnView | undefined;
  let index: number;
  if (overId.startsWith(COLUMN_PREFIX)) {
    target = columns.find((column) => column.stage.id === overId.slice(COLUMN_PREFIX.length));
    index = target ? target.tasks.filter((task) => task.id !== activeId).length : 0;
  } else {
    const over = locate(columns, overId);
    target = over?.column;
    index = over?.index ?? 0;
  }
  if (!target) return null;
  const others = target.tasks.filter((task) => task.id !== activeId);
  const afterTaskId = others[index - 1]?.id ?? null;
  const unchanged = target.stage.id === from.column.stage.id && afterTaskId === (from.column.tasks[from.index - 1]?.id ?? null);
  return unchanged ? null : { taskId: activeId, toStageId: target.stage.id, afterTaskId };
}

export interface NeighborMoves {
  up: MoveRequest | null;
  down: MoveRequest | null;
  toStages: { stageId: string; name: string; request: MoveRequest }[];
}

/** The moves a keyboard or menu user can pick: one place up or down, or the end of any other stage. */
export function neighborMoves(columns: ColumnView[], taskId: string): NeighborMoves {
  const here = locate(columns, taskId);
  if (!here) return { up: null, down: null, toStages: [] };
  const { column, index } = here;
  const inColumn = (afterTaskId: string | null): MoveRequest => ({ taskId, toStageId: column.stage.id, afterTaskId });
  return {
    up: index > 0 ? inColumn(column.tasks[index - 2]?.id ?? null) : null,
    down: index < column.tasks.length - 1 ? inColumn(column.tasks[index + 1]!.id) : null,
    toStages: columns
      .filter((other) => other.stage.id !== column.stage.id)
      .map((other) => ({
        stageId: other.stage.id,
        name: other.stage.name,
        request: { taskId, toStageId: other.stage.id, afterTaskId: null, toEnd: true },
      })),
  };
}

/** Droppable ids of pipeline tabs, prefixed so they can never collide with a task or a column. */
export const PIPELINE_PREFIX = "pipeline:";
export const pipelineTabId = (pipelineId: string) => `${PIPELINE_PREFIX}${pipelineId}`;

/** The pipeline a tab droppable id names, or null for any other id. */
export const pipelineOfDroppable = (id: string): string | null => (id.startsWith(PIPELINE_PREFIX) ? id.slice(PIPELINE_PREFIX.length) : null);

export interface TabDrop {
  request: MoveRequest;
  pipelineName: string;
  stageName: string;
}

/**
 * Dropping a card on another pipeline's tab sends it to the END of that pipeline's first stage. Null when the id is not
 * another pipeline's tab, the pipeline has no stage to land in, or the card is not on this board.
 */
export function resolveTabDrop(pipelines: PipelineOption[], currentPipelineId: string, columns: ColumnView[], activeId: string, overId: string): TabDrop | null {
  const pipelineId = pipelineOfDroppable(overId);
  const target = pipelines.find((pipeline) => pipeline.id === pipelineId && pipeline.id !== currentPipelineId);
  const first = target?.stages[0];
  if (!target || !first || !locate(columns, activeId)) return null;
  return { request: { taskId: activeId, toStageId: first.id, afterTaskId: null, toEnd: true }, pipelineName: target.name, stageName: first.name };
}

export interface CrossMoveGroup {
  pipelineId: string;
  name: string;
  stages: { stageId: string; name: string; request: MoveRequest }[];
}

/** The end of every stage of every OTHER pipeline, grouped by pipeline: what the Move menu offers beyond this board's columns. */
export function crossMoves(pipelines: PipelineOption[], currentPipelineId: string, taskId: string): CrossMoveGroup[] {
  return pipelines
    .filter((pipeline) => pipeline.id !== currentPipelineId && pipeline.stages.length > 0)
    .map((pipeline) => ({
      pipelineId: pipeline.id,
      name: pipeline.name,
      stages: pipeline.stages.map((stage) => ({ stageId: stage.id, name: stage.name, request: { taskId, toStageId: stage.id, afterTaskId: null, toEnd: true } })),
    }));
}
