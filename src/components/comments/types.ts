/** What the comment components render: serializable, no storage keys, no ids of other people. */
export interface AttachmentRow {
  id: string;
  fileName: string;
  contentType: string;
  size: number;
}

export interface CommentRow {
  id: string;
  authorName: string;
  body: string;
  /** ISO timestamp. */
  createdAt: string;
  /** Whether the viewer may edit or delete it (own comment, or a board owner). */
  canManage: boolean;
  attachments: AttachmentRow[];
}
