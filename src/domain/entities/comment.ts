export type AttachmentStatus = "pending" | "confirmed";

export interface Comment {
  id: string;
  taskId: string;
  boardId: string;
  /** Null once the author was deleted (UI: "Deleted user"). */
  authorId: string | null;
  body: string;
  createdAt: Date;
}

/** Metadata only: the bytes live in object storage under `storageKey`. */
export interface Attachment {
  id: string;
  commentId: string | null;
  boardId: string;
  /** Null once the uploader was deleted. */
  uploaderId: string | null;
  storageKey: string;
  fileName: string;
  contentType: string;
  size: number;
  status: AttachmentStatus;
  createdAt: Date;
}
