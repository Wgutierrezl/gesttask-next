# ADR 0019: A task can move to any pipeline of its board

Status: accepted (UI redesign, slice 5).

## Context

`moveTask` only accepted a destination stage in the task's own pipeline; a stage of a sibling pipeline was answered
with NotFound (REQ-ISO-07). The redesigned Kanban lets users move a card between the pipelines of a board, and the
isolation boundary that matters for confidentiality is the board, not the pipeline.

## Decision

- No new input and no new endpoint: `toStageId` already identifies the pipeline. `placeTask` resolves the destination
  with `stages.findById`; a stage of another board, or a missing one, is NotFound, indistinguishable from each other.
  REQ-ISO-07 is reinterpreted as board-level isolation.
- Authorization is unchanged: the same `task:write` permission as any move. A viewer is still Forbidden.
- Lock order stays the global one (boards, members, pipelines, stages, tasks): both pipelines' stage lists are locked
  in sorted pipeline-id order, then both task columns in sorted stage-id order. Two opposite moves therefore queue
  instead of deadlocking.
- One `UPDATE` sets `pipelineId`, `stageId`, `position` and `completedAt` (set or cleared by the destination's
  `isDone`, as for same-pipeline moves). Positions are fractional keys, so the source column needs no rewrite; only the
  destination may relocate siblings, as today.
- The pre-flight stage lookup checks `boardId` outside the transaction; that is safe because a stage's board never
  changes. If the task left its snapshot column meanwhile, the use case re-reads once and, if still stale, answers
  409 Conflict (documented on the operation).
- `POST /api/v1/tasks/{id}/move` is backward compatible: same body and responses, only the description widens.

## Consequences

- Comments and attachments are untouched; `boardId` never changes.
- Tests cover opposite-direction moves (one frozen holding a single pipeline lock), a move racing `deletePipeline` and
  `deleteStage`: none deadlock. A destination deleted before the move locks it ends in NotFound for the mover.
