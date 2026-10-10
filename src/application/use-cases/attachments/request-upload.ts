import { NotFoundError } from "@/domain/errors";
import type { Actor } from "../../actor";
import { UPLOAD_RATE_GUEST, UPLOAD_RATE_USER, storageKeyFor } from "../../attachment-policy";
import type { AppDeps } from "../../deps";
import { assertGuestAttachmentQuota } from "../../guest-quota";
import type { RateLimiter, StoragePort, UploadTicket } from "../../ports/services";
import { loadTask } from "../../resources";
import { requestUploadSchema } from "../../schemas/attachment";
import { parseInput } from "../../schemas/parse";
import { enforceRateLimit } from "../auth/_rate-limit";

export interface UploadRequest {
  attachmentId: string;
  ticket: UploadTicket;
}

/**
 * Step 1 of an upload (REQ-CMT-02): the application validates permission, type, size, rate and quota, and only then asks
 * the storage for a ticket. The attachment starts `pending`, owned by the requester, under a key the server made.
 */
export function makeRequestUpload(deps: AppDeps, ext: { storage: StoragePort; limiter: RateLimiter }) {
  return async (actor: Actor, input: unknown): Promise<UploadRequest> => {
    const { taskId, fileName, contentType, size } = parseInput(requestUploadSchema, input);
    await loadTask(deps.repos, actor, taskId, "attachment:create");
    await enforceRateLimit(ext.limiter, `upload:${actor.userId}`, actor.isGuest ? UPLOAD_RATE_GUEST : UPLOAD_RATE_USER);
    const now = deps.clock.now();
    const attachmentId = deps.ids.next();
    return deps.uow.run(async (tx) => {
      const task = await tx.tasks.findById(taskId);
      if (!task) throw new NotFoundError();
      await assertGuestAttachmentQuota(tx, actor, now);
      const storageKey = storageKeyFor(task.boardId, attachmentId);
      const ticket = await ext.storage.prepareUpload({ key: storageKey, contentType, size });
      await tx.attachments.insert({
        id: attachmentId, commentId: null, boardId: task.boardId, uploaderId: actor.userId, storageKey, fileName, contentType, size,
        status: "pending", createdAt: now,
      });
      return { attachmentId, ticket };
    });
  };
}
