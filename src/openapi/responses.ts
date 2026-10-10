import { z } from "zod";
import { BOARD_ROLES } from "@/domain/value-objects/board-role";
import { BOARD_STATUSES } from "@/domain/value-objects/board-status";

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
