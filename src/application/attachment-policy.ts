/** Attachment limits (REQ-ATT-01, REQ-ATT-06). They live in the application: adapters repeat them only as a second line of defense. */
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const ALLOWED_CONTENT_TYPES = ["image/png", "image/jpeg", "image/webp", "application/pdf", "text/plain"] as const;
export const MAX_ATTACHMENTS_PER_COMMENT = 5;
export const MAX_FILE_NAME_LENGTH = 120;
/** Signed download URLs live five minutes; the spec ceiling is fifteen (REQ-ATT-02). */
export const DOWNLOAD_TTL_SECONDS = 300;
/** An upload that was never attached to a comment counts against quotas for this long, then it is abandoned. */
export const PENDING_UPLOAD_TTL_MS = 60 * 60 * 1000;
/** Upload tickets per hour (REQ-SEC-03). */
export const UPLOAD_RATE_USER = { limit: 20, windowSeconds: 3600 };
export const UPLOAD_RATE_GUEST = { limit: 5, windowSeconds: 3600 };

/** Server-made key: board prefix plus the attachment id. The client's file name is never part of it (REQ-ATT-03). */
export const storageKeyFor = (boardId: string, attachmentId: string): string => `boards/${boardId}/attachments/${attachmentId}`;

/** Keeps the last path segment, drops control characters and caps the length: display metadata only, never a path. */
export function sanitizeFileName(raw: string): string {
  const last = raw.slice(Math.max(raw.lastIndexOf("/"), raw.lastIndexOf("\\")) + 1);
  return last.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, MAX_FILE_NAME_LENGTH).trim();
}
