import { sql } from "drizzle-orm";
import type { Database } from "../db/client";

/**
 * Hands everything a guest created to the account they just signed in to, so registering does not lose the
 * sandbox. One transaction; memberships the account already has are left alone.
 */
export async function transferGuestData(db: Database, guestUserId: string, userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`
      UPDATE board_members SET user_id = ${userId}
      WHERE user_id = ${guestUserId}
        AND board_id NOT IN (SELECT board_id FROM board_members WHERE user_id = ${userId})`);
    await tx.execute(sql`UPDATE tasks SET assignee_id = ${userId} WHERE assignee_id = ${guestUserId}`);
    await tx.execute(sql`UPDATE comments SET author_id = ${userId} WHERE author_id = ${guestUserId}`);
    await tx.execute(sql`UPDATE attachments SET uploader_id = ${userId} WHERE uploader_id = ${guestUserId}`);
  });
}
