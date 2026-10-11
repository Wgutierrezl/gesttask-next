import { BOARD_ROLES } from "@/domain/value-objects/board-role";
import { BOARD_STATUSES } from "@/domain/value-objects/board-status";
import { PRIORITIES } from "@/domain/value-objects/priority";
import { TASK_STATUSES } from "@/domain/value-objects/task-status";
import { z } from "./zod";

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
}).openapi("Board");

export const boardWithRoleResponse = z.strictObject({ board: boardResponse, role }).openapi("BoardWithRole");

export const memberResponse = z.strictObject({ boardId: id, userId: z.string(), role }).openapi("Member");

export const memberProfileResponse = z.strictObject({
  userId: z.string(),
  role,
  name: z.string(),
  /** Only for callers who may manage members; null for everyone else. */
  email: z.string().nullable(),
}).openapi("MemberProfile");

export const pipelineResponse = z.strictObject({ id, boardId: id, name: z.string(), description: z.string() }).openapi("Pipeline");

export const pipelineWithRoleResponse = z.strictObject({ pipeline: pipelineResponse, role }).openapi("PipelineWithRole");

export const stageResponse = z.strictObject({
  id,
  pipelineId: id,
  boardId: id,
  name: z.string(),
  isDone: z.boolean(),
  /** Fractional index inside the pipeline: orders stages, never built by clients (use afterStageId). */
  position: z.string(),
}).openapi("Stage");

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
}).openapi("Task");

/** What `createComment` and `editComment` return: the stored comment. */
export const commentResponse = z.strictObject({
  id,
  taskId: id,
  boardId: id,
  /** Null once the author's account is gone. */
  authorId: z.string().nullable(),
  body: z.string(),
  createdAt: dateTime,
}).openapi("Comment");

export const attachmentMetadataResponse = z.strictObject({ id, fileName: z.string(), contentType: z.string(), size: z.number().int() }).openapi("AttachmentMetadata");

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
}).openapi("CommentView");

/** How to send the file, by storage driver: S3 presigned POST, Vercel Blob client token, or the local dev PUT. */
export const uploadTicketResponse = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("s3-post"), url: z.url(), fields: z.record(z.string(), z.string()) }),
  z.strictObject({ kind: z.literal("blob-token"), clientToken: z.string(), pathname: z.string() }),
  z.strictObject({ kind: z.literal("local-put"), url: z.url() }),
]).openapi("UploadTicket");

export const uploadRequestResponse = z.strictObject({ attachmentId: id, ticket: uploadTicketResponse }).openapi("UploadRequest");

export const attachmentDownloadResponse = z.strictObject({
  /** Signed and expiring: a credential. */
  url: z.url(),
  fileName: z.string(),
  contentType: z.string(),
  expiresInSeconds: z.number().int(),
}).openapi("AttachmentDownload");

const count = z.number().int().min(0);

/** Every priority and status is always present: an empty board reads as zeros, never as a missing key (REQ-DSH-02). */
export const taskCountsResponse = z.strictObject({
  total: count,
  byPriority: z.strictObject({ low: count, medium: count, high: count }),
  byStatus: z.strictObject({ active: count, inactive: count }),
  /** Past due and not completed; due dates are UTC calendar dates. */
  overdue: count,
}).openapi("TaskCounts");

export const userDashboardResponse = z.strictObject({
  /** Boards you are a member of. */
  boards: count,
  /** Tasks assigned to you on those boards. */
  assigned: taskCountsResponse,
}).openapi("UserDashboard");

export const stageDashboardResponse = z.strictObject({ id, name: z.string(), isDone: z.boolean(), tasks: taskCountsResponse }).openapi("StageDashboard");

export const pipelineDashboardResponse = z.strictObject({
  id,
  name: z.string(),
  /** In board order, empty stages included. */
  stages: z.array(stageDashboardResponse),
  tasks: taskCountsResponse,
}).openapi("PipelineDashboard");

export const boardDashboardResponse = z.strictObject({
  boardId: id,
  members: count,
  pipelines: z.array(pipelineDashboardResponse),
  tasks: taskCountsResponse,
}).openapi("BoardDashboard");

/** The uniform error envelope (REQ-API-03). */
export const errorResponse = z.strictObject({
  error: z.strictObject({
    code: z.enum(["BAD_REQUEST", "PAYLOAD_TOO_LARGE", "VALIDATION", "UNAUTHENTICATED", "FORBIDDEN", "NOT_FOUND", "CONFLICT", "RATE_LIMITED", "STORAGE", "UNAVAILABLE", "INTERNAL"]),
    message: z.string(),
    details: z.record(z.string(), z.array(z.string())).optional(),
    requestId: z.string(),
  }),
}).openapi("Error");

/** `{ items, nextCursor }` around the item schema of a list. */
export const pageOf = <T extends z.ZodType>(item: T) => z.strictObject({ items: z.array(item), nextCursor: z.string().nullable() });
