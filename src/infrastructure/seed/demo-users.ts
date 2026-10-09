import type { Database } from "../db/client";
import { user } from "../db/schema";
import { DEMO_OWNER_ID, DEMO_VIEWER_ID } from "./seed-demo-board";

/**
 * The demo board references its owner and viewer as real users (foreign keys), but they are not accounts:
 * no credentials, no sessions. Idempotent; call before `seedDemoBoard`.
 */
export async function ensureDemoUsers(db: Database): Promise<void> {
  const now = new Date();
  await db
    .insert(user)
    .values([
      { id: DEMO_OWNER_ID, name: "Demo Owner", email: `${DEMO_OWNER_ID}@demo.invalid`, createdAt: now, updatedAt: now },
      { id: DEMO_VIEWER_ID, name: "Demo Viewer", email: `${DEMO_VIEWER_ID}@demo.invalid`, createdAt: now, updatedAt: now },
    ])
    .onConflictDoNothing();
}
