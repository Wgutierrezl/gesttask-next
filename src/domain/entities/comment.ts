export type AttachmentStatus = "pending" | "confirmed";

export interface Comment {
  id: string;
  taskId: string;
  boardId: string;
  authorId: string;
  body: string;
  createdAt: Date;
}

/** Metadata only: the bytes live in object storage under `storageKey`. */
export interface Attachment {
  id: string;
  commentId: string | null;
  boardId: string;
  uploaderId: string;
  storageKey: string;
  fileName: string;
  contentType: string;
  size: number;
  status: AttachmentStatus;
  createdAt: Date;
}
