import { NotFoundError } from "@/domain/errors";
import type { Actor } from "../../actor";
import { DOWNLOAD_TTL_SECONDS } from "../../attachment-policy";
import { requireBoardAccess } from "../../authorize";
import type { AppDeps } from "../../deps";
import type { StoragePort } from "../../ports/services";
import { attachmentIdSchema } from "../../schemas/attachment";
import { parseInput } from "../../schemas/parse";

export interface AttachmentDownload {
  /** Signed and expiring: a credential. Callers must not log it or store it. */
  url: string;
  fileName: string;
  contentType: string;
  expiresInSeconds: number;
}

/**
 * Any board member may download (REQ-BRD-06). The board is the attachment's own; a missing id, a foreign one and an
 * upload that never became part of a comment all answer the same NotFound (REQ-ISO-08), and nothing is signed.
 */
export function makeGetAttachmentUrl(deps: AppDeps, ext: { storage: StoragePort }) {
  return async (actor: Actor, input: unknown): Promise<AttachmentDownload> => {
    const { attachmentId } = parseInput(attachmentIdSchema, input);
    const attachment = await deps.repos.attachments.findById(attachmentId);
    if (!attachment) throw new NotFoundError();
    await requireBoardAccess(deps.repos.members, actor, attachment.boardId, "board:view");
    if (attachment.status !== "confirmed") throw new NotFoundError();
    const url = await ext.storage.getDownloadUrl(attachment.storageKey, DOWNLOAD_TTL_SECONDS);
    return { url, fileName: attachment.fileName, contentType: attachment.contentType, expiresInSeconds: DOWNLOAD_TTL_SECONDS };
  };
}
