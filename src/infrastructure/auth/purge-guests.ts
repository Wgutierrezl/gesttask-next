import { sql } from "drizzle-orm";
import type { Database } from "../db/client";

/** Guest sandboxes live 24 hours after the guest was created (REQ-SEC-04). */
export const GUEST_TTL_HOURS = 24;

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

export interface PurgeOptions {
  now: Date;
  /**
   * Runs inside the purge transaction, BEFORE the boards are deleted. Slice 6 passes the callback that reads the
   * attachment storage keys of `boardIds` and enqueues them in the deletion outbox, so no object is orphaned.
   */
  beforeDeleteBoards?: (tx: Tx, boardIds: string[]) => Promise<void>;
}

export interface PurgeResult {
  users: number;
  boards: number;
  /** Expired guests kept because a comment or upload of theirs still lives on a surviving board. */
  skipped: number;
}

/**
 * Deletes expired anonymous users and the sandboxes only they own (REQ-CAS-03). Boards that a real account
 * also owns survive, and so do guests that still author comments or uploads elsewhere (they retry next run).
 * One transaction: a failure leaves everything as it was. Cron wiring lands in slice 9.
 */
export async function purgeExpiredGuests(db: Database, options: PurgeOptions): Promise<PurgeResult> {
  const cutoff = new Date(options.now.getTime() - GUEST_TTL_HOURS * 3_600_000);
  return db.transaction(async (tx) => {
    const expired = await tx.execute<{ id: string }>(sql`
      SELECT id FROM "user" WHERE is_anonymous AND created_at < ${cutoff.toISOString()} ORDER BY id FOR UPDATE`);
    const ids = expired.rows.map((row) => row.id);
    if (ids.length === 0) return { users: 0, boards: 0, skipped: 0 };
    const guests = sql`(${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`;

    const owned = await tx.execute<{ board_id: string }>(sql`
      SELECT DISTINCT m.board_id FROM board_members m
      WHERE m.role = 'owner' AND m.user_id IN ${guests}
        AND NOT EXISTS (
          SELECT 1 FROM board_members o WHERE o.board_id = m.board_id AND o.role = 'owner' AND o.user_id NOT IN ${guests})
      ORDER BY m.board_id`);
    const boardIds = owned.rows.map((row) => row.board_id);
    if (boardIds.length > 0) {
      await options.beforeDeleteBoards?.(tx, boardIds);
      await tx.execute(sql`DELETE FROM boards WHERE id IN (${sql.join(boardIds.map((id) => sql`${id}::uuid`), sql`, `)})`);
    }

    const removable = await tx.execute<{ id: string }>(sql`
      DELETE FROM "user" u WHERE u.id IN ${guests}
        AND NOT EXISTS (SELECT 1 FROM comments c WHERE c.author_id = u.id)
        AND NOT EXISTS (SELECT 1 FROM attachments a WHERE a.uploader_id = u.id)
      RETURNING u.id`);
    return { users: removable.rows.length, boards: boardIds.length, skipped: ids.length - removable.rows.length };
  });
}
