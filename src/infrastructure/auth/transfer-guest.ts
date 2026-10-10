import { sql } from "drizzle-orm";
import type { Database } from "../db/client";
import type { Logger } from "../logging/logger";

const roleRank = (column: string) =>
  sql.raw(`CASE ${column} WHEN 'owner' THEN 3 WHEN 'member' THEN 2 ELSE 1 END`);

/**
 * Hands everything a guest created to the account they just signed in to, so registering does not lose the
 * sandbox. One transaction. On a board both already belong to, the account keeps the higher of the two roles
 * (so a guest-owned board never ends up ownerless or with a stale guest owner) and the guest row is dropped.
 *
 * A failure is logged (ids only) and swallowed: the account already exists, so failing the sign-up would only
 * leave a registered user who sees an error; the guest data then simply expires with its TTL.
 */
export async function transferGuestData(db: Database, guestUserId: string, userId: string, logger: Logger): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`
        UPDATE board_members a SET role = g.role FROM board_members g
        WHERE a.user_id = ${userId} AND g.user_id = ${guestUserId} AND g.board_id = a.board_id
          AND ${roleRank("g.role")} > ${roleRank("a.role")}`);
      await tx.execute(sql`
        DELETE FROM board_members
        WHERE user_id = ${guestUserId} AND board_id IN (SELECT board_id FROM board_members WHERE user_id = ${userId})`);
      await tx.execute(sql`UPDATE board_members SET user_id = ${userId} WHERE user_id = ${guestUserId}`);
      await tx.execute(sql`UPDATE tasks SET assignee_id = ${userId} WHERE assignee_id = ${guestUserId}`);
      await tx.execute(sql`UPDATE comments SET author_id = ${userId} WHERE author_id = ${guestUserId}`);
      await tx.execute(sql`UPDATE attachments SET uploader_id = ${userId} WHERE uploader_id = ${guestUserId}`);
    });
  } catch (error) {
    logger.error("guest data transfer failed", { guestUserId, userId, error });
  }
}
