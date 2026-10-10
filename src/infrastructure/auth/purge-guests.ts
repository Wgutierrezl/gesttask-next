import { sql } from "drizzle-orm";
import type { Database } from "../db/client";
import { DEMO_OWNER_ID, DEMO_VIEWER_ID } from "../seed/seed-demo-board";
import { GUEST_TTL_MS } from "./guest-ttl";

export { GUEST_TTL_HOURS } from "./guest-ttl";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

export interface PurgeOptions {
  now: Date;
  /**
   * Runs inside the purge transaction, BEFORE the boards are deleted. Slice 6 passes the callback that reads the
   * attachment storage keys of `boardIds` and enqueues them in the deletion outbox, so no object is orphaned.
   * Required on purpose: forgetting it would silently leak stored files once attachments exist.
   */
  beforeDeleteBoards: (tx: Tx, boardIds: string[]) => Promise<void>;
}

export interface PurgeResult {
  users: number;
  boards: number;
}

const list = (values: string[]) => sql`(${sql.join(values.map((value) => sql`${value}`), sql`, `)})`;

/**
 * Deletes expired anonymous users and the sandboxes that only they (and the login-less demo users) use
 * (REQ-CAS-03). A board with any other member, real account or unexpired guest, is kept: only the expired
 * guests leave it (their comments keep a null author) and, if that left it without an owner, a remaining
 * member is promoted. One transaction: a failure leaves everything as it was. Cron wiring lands in slice 9.
 */
export async function purgeExpiredGuests(db: Database, options: PurgeOptions): Promise<PurgeResult> {
  if (typeof options.beforeDeleteBoards !== "function") {
    throw new Error("purgeExpiredGuests needs beforeDeleteBoards: attachment objects would be orphaned without it");
  }
  const cutoff = new Date(options.now.getTime() - GUEST_TTL_MS);
  return db.transaction(async (tx) => {
    const expired = await tx.execute<{ id: string }>(sql`
      SELECT id FROM "user" WHERE is_anonymous AND created_at < ${cutoff.toISOString()} ORDER BY id FOR UPDATE`);
    const ids = expired.rows.map((row) => row.id);
    if (ids.length === 0) return { users: 0, boards: 0 };
    const guests = list(ids);
    const sandboxUsers = list([...ids, DEMO_OWNER_ID, DEMO_VIEWER_ID]);

    const touched = await tx.execute<{ board_id: string; purgeable: boolean }>(sql`
      SELECT m.board_id,
             NOT EXISTS (SELECT 1 FROM board_members o WHERE o.board_id = m.board_id AND o.user_id NOT IN ${sandboxUsers}) AS purgeable
      FROM board_members m WHERE m.user_id IN ${guests} GROUP BY m.board_id ORDER BY m.board_id`);
    const boardIds = touched.rows.filter((row) => row.purgeable).map((row) => row.board_id);
    const keptIds = touched.rows.filter((row) => !row.purgeable).map((row) => row.board_id);
    if (boardIds.length > 0) {
      await options.beforeDeleteBoards(tx, boardIds);
      await tx.execute(sql`DELETE FROM boards WHERE id IN (${sql.join(boardIds.map((id) => sql`${id}::uuid`), sql`, `)})`);
    }

    const removed = await tx.execute<{ id: string }>(sql`DELETE FROM "user" WHERE id IN ${guests} RETURNING id`);
    if (keptIds.length > 0) {
      await tx.execute(sql`
        UPDATE board_members SET role = 'owner' WHERE (board_id, user_id) IN (
          SELECT DISTINCT ON (m.board_id) m.board_id, m.user_id FROM board_members m
          WHERE m.board_id IN (${sql.join(keptIds.map((id) => sql`${id}::uuid`), sql`, `)})
            AND m.user_id NOT IN (${DEMO_OWNER_ID}, ${DEMO_VIEWER_ID})
            AND NOT EXISTS (SELECT 1 FROM board_members o WHERE o.board_id = m.board_id AND o.role = 'owner')
          ORDER BY m.board_id, (m.role = 'member') DESC, m.user_id)`);
    }
    return { users: removed.rows.length, boards: boardIds.length };
  });
}
