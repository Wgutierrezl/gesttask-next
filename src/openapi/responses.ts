import { z } from "zod";
import { BOARD_ROLES } from "@/domain/value-objects/board-role";
import { BOARD_STATUSES } from "@/domain/value-objects/board-status";
import { PRIORITIES } from "@/domain/value-objects/priority";
import { TASK_STATUSES } from "@/domain/value-objects/task-status";

/**
 * What the API answers, as strict schemas: an unlisted field fails the contract tests, so a column added to an entity
 * never reaches a client by accident. Dates travel as ISO-8601 strings.
 */
const id = z.uuid();
const dateTime = z.iso.datetime();
const role = z.enum(BOARD_ROLES);

export const boardResponse = z.strictObject({
  id,
  name: z.string(),
  description: z.string(),
  status: z.enum(BOARD_STATUSES),
  createdAt: dateTime,
});

export const boardWithRoleResponse = z.strictObject({ board: boardResponse, role });

export const memberResponse = z.strictObject({ boardId: id, userId: z.string(), role });

export const memberProfileResponse = z.strictObject({
  userId: z.string(),
  role,
  name: z.string(),
  /** Only for callers who may manage members; null for everyone else. */
  email: z.string().nullable(),
});

export const pipelineResponse = z.strictObject({ id, boardId: id, name: z.string(), description: z.string() });

export const pipelineWithRoleResponse = z.strictObject({ pipeline: pipelineResponse, role });

export const stageResponse = z.strictObject({
  id,
  pipelineId: id,
  boardId: id,
  name: z.string(),
  isDone: z.boolean(),
  /** Fractional index inside the pipeline: orders stages, never built by clients (use afterStageId). */
  position: z.string(),
});

export const taskResponse = z.strictObject({
  id,
  boardId: id,
  pipelineId: id,
  stageId: id,
  title: z.string(),
  description: z.string(),
  priority: z.enum(PRIORITIES),
  status: z.enum(TASK_STATUSES),
  /** A calendar date (YYYY-MM-DD); may be in the past. */
  dueDate: z.iso.date().nullable(),
  assigneeId: z.string().nullable(),
  /** Set when the task enters the done stage, cleared when it leaves. */
  completedAt: dateTime.nullable(),
  /** Fractional index inside the stage: orders cards, never built by clients (use afterTaskId or toEnd). */
  position: z.string(),
  createdAt: dateTime,
  /** Derived at read time: past due and not completed. */
  overdue: z.boolean(),
});

/** What `createComment` and `editComment` return: the stored comment. */
export const commentResponse = z.strictObject({
  id,
  taskId: id,
  boardId: id,
  /** Null once the author's account is gone. */
  authorId: z.string().nullable(),
  body: z.string(),
  createdAt: dateTime,
});

export const attachmentMetadataResponse = z.strictObject({ id, fileName: z.string(), contentType: z.string(), size: z.number().int() });

export const commentViewResponse = z.strictObject({
  id,
  taskId: id,
  authorId: z.string().nullable(),
  /** "Deleted user" once the account is gone. */
  authorName: z.string(),
  body: z.string(),
  createdAt: dateTime,
  attachments: z.array(attachmentMetadataResponse),
  /** Whether you may edit or delete it. */
  canManage: z.boolean(),
});

/** How to send the file, by storage driver: S3 presigned POST, Vercel Blob client token, or the local dev PUT. */
export const uploadTicketResponse = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("s3-post"), url: z.url(), fields: z.record(z.string(), z.string()) }),
  z.strictObject({ kind: z.literal("blob-token"), clientToken: z.string(), pathname: z.string() }),
  z.strictObject({ kind: z.literal("local-put"), url: z.url() }),
]);

export const uploadRequestResponse = z.strictObject({ attachmentId: id, ticket: uploadTicketResponse });

export const attachmentDownloadResponse = z.strictObject({
  /** Signed and expiring: a credential. */
  url: z.url(),
  fileName: z.string(),
  contentType: z.string(),
  expiresInSeconds: z.number().int(),
});

/** The uniform error envelope (REQ-API-03). */
export const errorResponse = z.strictObject({
  error: z.strictObject({
    code: z.enum(["VALIDATION", "UNAUTHENTICATED", "FORBIDDEN", "NOT_FOUND", "CONFLICT", "RATE_LIMITED", "STORAGE", "INTERNAL"]),
    message: z.string(),
    details: z.record(z.string(), z.array(z.string())).optional(),
    requestId: z.string(),
  }),
});

/** `{ items, nextCursor }` around the item schema of a list. */
export const pageOf = <T extends z.ZodType>(item: T) => z.strictObject({ items: z.array(item), nextCursor: z.string().nullable() });
