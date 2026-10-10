# ADR 0011: Storage objects are deleted through an outbox written in the delete transaction

Status: accepted (slice 6, 2026-10-10).

## Context

Deleting a comment, task, pipeline, board or an expired demo sandbox removes `attachments` rows by foreign-key
cascade, but the objects live in the storage. Deleting them before the commit would lose files when the transaction
rolls back; deleting them after the commit with no record would orphan them whenever the storage fails (the v1 bug).

## Decision

1. In the SAME transaction as the delete, the use case reads the storage keys that will disappear
   (`AttachmentRepo.keysUnder(scope)`) and enqueues them in `storage_deletions` (`enqueueAttachmentCleanup`).
   Boards, pipelines, stages, tasks, comments and the guest purge (`purgeExpiredGuests`'s required
   `beforeDeleteBoards` hook) all do it. If the transaction rolls back, the keys vanish with it.
2. `drainStorageDeletions` (a worker, not a use case) claims queued rows with a lease, deletes the objects
   (idempotent for missing keys), and removes the row only once the storage confirmed. A failure keeps the row, with
   backoff growing per attempt and a dead letter after ten, and is logged with the key but never with secrets.
3. After a delete that may have queued objects, the Server Action schedules the drain with `after()` (fast path); the
   daily cron (slice 9) calls `container.maintenance.drainStorageDeletions()` as the safety net.

## Race safety

A comment (or upload request) being created while its task (or board) is deleted must not slip an object past the
queue. `keysUnder` runs after locking the tasks below the scope (`SELECT ... FOR UPDATE`, primary-key order, the
global lock order), and every writer takes a `FOR KEY SHARE`-conflicting lock on the same task row: the comment insert
needs the task, the upload request locks the task. The loser waits and then fails with `NotFound`. The integration
tests pin this with a deleter paused right after queueing and a writer that must block on a lock.

Lock order is board, then task: the comment and pending-upload inserts take a `KEY SHARE` on the board for their
foreign key, and a board delete holds the board and then waits for its tasks. A writer that locked the task first
formed a cycle with it (`40P01`, retried by the unit of work but a wasted second of `deadlock_timeout` each time), so
`createComment` and `requestUpload` lock the board row before the task. The cost is that comments and upload requests
on one board queue behind each other for the length of their transaction, which is negligible at this scale.

### Task writers (slice 7 review)

The same question was raised for `createTask`: it locks the stage and then inserts a task. Evidence, with the unit of
work at `maxAttempts: 1` (`tests/integration/concurrency/lock-order-structure.test.ts`):

- Against `deleteBoard` there is NO cycle. `tasks` has no foreign key to `boards` (only composite keys to its pipeline
  and its stage), so the insert never needs the board row; that test passed before any change.
- The insert does take `KEY SHARE` on the pipeline and the stage, and that exposed real cycles with the other parents:
  `deletePipeline` and `deleteStage` hold the pipeline and wait for tasks that `createTask` holds; `deleteBoard` locked
  all tasks before the pipelines, crossing a `moveTask` that holds the pipeline and waits for tasks; `updateTask` locked
  the task and then the assignee's membership while `removeMember` locks the membership and then clears assignments.
  Each reproduced as `40P01`.
- Fixes, all toward the one order (boards, members, pipelines, stages, tasks): `createTask` checks the assignee, then
  locks the pipeline's stage list and picks its stage from it (as `moveTask` already did); `updateTask` checks the
  assignee before the task; `keysUnder({ boardId })` locks the pipelines before the tasks. Cost: creating tasks in one
  pipeline queues like moves already did.

## Abandoned uploads

A pending upload that never becomes part of a comment would sit in the table and in the storage forever. After
`PENDING_UPLOAD_TTL_MS` (one hour) it stops counting for quotas and cannot be linked (`assertLinkable`), and
`container.maintenance.sweepPendingUploads()` deletes the row and queues its key in the same transaction
(`SKIP LOCKED`, so a row being linked at that moment is left alone). The cron of slice 9 calls it next to the drain.

## Consequences

- Deletion is at-least-once and idempotent; there is no window where a row is gone and its key is unrecorded.
- The deletion stays out of the transaction, so a storage outage never blocks deleting a board.
- Switching `STORAGE_DRIVER` does not migrate objects: keys queued for another driver delete nothing (they succeed as
  missing keys), which is the documented behavior.
