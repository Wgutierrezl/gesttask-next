import type { AttachmentScope, Repos } from "./ports/repositories";

/**
 * The rule every cascading delete follows (REQ-CAS-02): before rows with attachments below them disappear, read the
 * storage keys that die with them and queue those keys in the SAME transaction. If the transaction rolls back the keys
 * vanish with it; if it commits the worker deletes the objects afterwards, so no object is ever orphaned.
 * Callers lock the scope's own row first (see `AttachmentRepo.keysUnder`).
 */
export async function enqueueAttachmentCleanup(tx: Pick<Repos, "attachments" | "outbox">, scope: AttachmentScope): Promise<void> {
  await tx.outbox.enqueue(await tx.attachments.keysUnder(scope));
}
