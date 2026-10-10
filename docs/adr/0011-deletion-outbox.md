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

## Consequences

- Deletion is at-least-once and idempotent; there is no window where a row is gone and its key is unrecorded.
- The deletion stays out of the transaction, so a storage outage never blocks deleting a board.
- Switching `STORAGE_DRIVER` does not migrate objects: keys queued for another driver delete nothing (they succeed as
  missing keys), which is the documented behavior.
