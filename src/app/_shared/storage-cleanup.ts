import { after } from "next/server";
import { getContainer } from "@/infrastructure/container";

/**
 * After a delete that may have queued storage objects (REQ-CAS-02): try to remove them once the response is sent. This
 * is only the fast path; whatever fails or is cut short stays on the outbox for the daily cron to finish.
 */
export function scheduleStorageCleanup(): void {
  after(async () => {
    const { maintenance, logger } = getContainer();
    try {
      await maintenance.drainStorageDeletions();
    } catch (error) {
      logger.error("storage cleanup failed", { error });
    }
  });
}
