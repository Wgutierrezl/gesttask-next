import { ConflictError, NotFoundError, ValidationError } from "@/domain/errors";
import type { Attachment } from "@/domain/entities/comment";
import type { Actor } from "../../actor";
import { MAX_ATTACHMENT_BYTES, PENDING_UPLOAD_TTL_MS } from "../../attachment-policy";
import type { StoragePort } from "../../ports/services";

/**
 * The uploads a new comment may take: the caller's own, from this board, still pending. Anything else (unknown id,
 * someone else's upload, another board's) answers NotFound so ids reveal nothing; an upload already used is a Conflict.
 * A pending upload older than `PENDING_UPLOAD_TTL_MS` is abandoned: it no longer counts against the guest quota (so it
 * could be reused to exceed it) and the sweeper may delete it any moment, so it cannot be linked any more.
 */
export function assertLinkable(found: Attachment[], ids: readonly string[], actor: Actor, boardId: string, now: Date): Attachment[] {
  const byId = new Map(found.map((a) => [a.id, a]));
  const rows = ids.map((id) => byId.get(id));
  if (rows.some((a) => !a || a.uploaderId !== actor.userId || a.boardId !== boardId)) throw new NotFoundError();
  const usable = rows as Attachment[];
  if (usable.some((a) => a.status !== "pending")) throw new ConflictError("This file is already attached to a comment");
  if (usable.some((a) => a.createdAt.getTime() < now.getTime() - PENDING_UPLOAD_TTL_MS)) throw expired();
  return usable;
}

const expired = () => new ValidationError("Invalid input", { attachmentIds: ["A file took too long to attach. Upload it again."] });
const notUploaded = () => new ValidationError("Invalid input", { attachmentIds: ["A file did not finish uploading. Try attaching it again."] });

/** Asks the storage what really arrived (REQ-CMT-02): it must exist, fit the limit and the ticket, and have the declared type. */
export async function verifyUploads(storage: StoragePort, rows: Attachment[]): Promise<Map<string, number>> {
  const sizes = new Map<string, number>();
  for (const row of rows) {
    const object = await storage.head(row.storageKey);
    if (!object || object.size < 1 || object.size > Math.min(row.size, MAX_ATTACHMENT_BYTES) || object.contentType !== row.contentType) throw notUploaded();
    sizes.set(row.id, object.size);
  }
  return sizes;
}
