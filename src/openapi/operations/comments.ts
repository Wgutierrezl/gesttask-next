import { attachmentIdSchema, requestUploadSchema } from "@/application/schemas/attachment";
import { commentIdSchema, createCommentSchema, editCommentSchema } from "@/application/schemas/comment";
import { taskIdSchema } from "@/application/schemas/task";
import type { Operation } from "../operation";
import { pageQuery } from "../page-query";
import { attachmentDownloadResponse, commentResponse, commentViewResponse, uploadRequestResponse } from "../responses";

export const commentOperations: Operation[] = [
  {
    id: "listComments", method: "get", path: "/tasks/{taskId}/comments", tag: "Comments",
    summary: "List the comments of a task, oldest first, with author names and attachment metadata (never storage keys)",
    params: taskIdSchema, query: pageQuery, response: { kind: "list", item: commentViewResponse, paginated: true },
  },
  {
    id: "createComment", method: "post", path: "/tasks/{taskId}/comments", tag: "Comments",
    summary: "Comment on a task; attachmentIds link uploads already sent to the storage (files need owner or member)",
    params: taskIdSchema, body: createCommentSchema.omit({ taskId: true }), response: { kind: "item", status: 201, schema: commentResponse },
  },
  {
    id: "editComment", method: "patch", path: "/comments/{commentId}", tag: "Comments", summary: "Edit your own comment",
    params: commentIdSchema, body: editCommentSchema.omit({ commentId: true }), response: { kind: "item", status: 200, schema: commentResponse },
  },
  {
    id: "deleteComment", method: "delete", path: "/comments/{commentId}", tag: "Comments",
    summary: "Delete your own comment, or any comment as a board owner; its attachments are removed too",
    params: commentIdSchema, response: { kind: "none" },
  },
  {
    id: "requestUpload", method: "post", path: "/tasks/{taskId}/uploads", tag: "Attachments",
    summary: "Ask for a short-lived ticket to upload a file straight to the storage (max 5 MB; png, jpeg, webp, pdf, text)",
    params: taskIdSchema, body: requestUploadSchema.omit({ taskId: true }), response: { kind: "item", status: 201, schema: uploadRequestResponse },
  },
  {
    id: "getAttachmentUrl", method: "get", path: "/attachments/{attachmentId}/download", tag: "Attachments",
    summary: "Get a signed, expiring download URL for an attachment (a credential: do not store or log it)",
    params: attachmentIdSchema, response: { kind: "item", status: 200, schema: attachmentDownloadResponse }, hidesExistence: true,
  },
];
