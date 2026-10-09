import { sql } from "drizzle-orm";
import {
  boolean, customType, date, foreignKey, index, integer, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex,
  unique, uuid,
} from "drizzle-orm/pg-core";
import { BOARD_ROLES } from "@/domain/value-objects/board-role";
import { BOARD_STATUSES } from "@/domain/value-objects/board-status";
import { PRIORITIES } from "@/domain/value-objects/priority";
import { TASK_STATUSES } from "@/domain/value-objects/task-status";

/**
 * User references are plain `text` ids WITHOUT foreign keys for now: Better Auth (slice 3) owns the
 * `user` table and its ids are text. Slice 3 adds the FK constraints in a migration (assignee_id gets
 * ON DELETE SET NULL, the rest CASCADE or RESTRICT as decided there).
 */

/** Bytewise ordering: fractional position keys must sort identically in SQL and in the domain. */
const positionText = customType<{ data: string }>({ dataType: () => 'text COLLATE "C"' });
const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const boardRole = pgEnum("board_role", BOARD_ROLES);
export const boardStatus = pgEnum("board_status", BOARD_STATUSES);
export const priority = pgEnum("priority", PRIORITIES);
export const taskStatus = pgEnum("task_status", TASK_STATUSES);
export const attachmentStatus = pgEnum("attachment_status", ["pending", "confirmed"]);

export const boards = pgTable(
  "boards",
  {
    id: uuid("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    status: boardStatus("status").notNull().default("active"),
    createdAt: timestamptz("created_at").notNull(),
  },
  (t) => [index("boards_created_at_id_idx").on(t.createdAt, t.id)],
);

export const boardMembers = pgTable(
  "board_members",
  {
    boardId: uuid("board_id").notNull().references(() => boards.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    role: boardRole("role").notNull(),
  },
  (t) => [
    // The composite primary key is the (board_id, user_id) unique constraint of REQ-BRD-03.
    primaryKey({ columns: [t.boardId, t.userId] }),
    index("board_members_user_id_idx").on(t.userId),
    index("board_members_board_role_idx").on(t.boardId, t.role),
  ],
);

export const pipelines = pgTable(
  "pipelines",
  {
    id: uuid("id").primaryKey(),
    boardId: uuid("board_id").notNull().references(() => boards.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
  },
  (t) => [
    // Target of the composite foreign keys that keep denormalized board ids consistent.
    unique("pipelines_id_board_id_uq").on(t.id, t.boardId),
    index("pipelines_board_id_idx").on(t.boardId),
  ],
);

export const stages = pgTable(
  "stages",
  {
    id: uuid("id").primaryKey(),
    pipelineId: uuid("pipeline_id").notNull(),
    boardId: uuid("board_id").notNull(),
    name: text("name").notNull(),
    isDone: boolean("is_done").notNull().default(false),
    position: positionText("position").notNull(),
  },
  (t) => [
    foreignKey({ columns: [t.pipelineId, t.boardId], foreignColumns: [pipelines.id, pipelines.boardId], name: "stages_pipeline_board_fk" })
      .onDelete("cascade"),
    unique("stages_id_pipeline_id_uq").on(t.id, t.pipelineId),
    uniqueIndex("stages_pipeline_lower_name_uq").on(t.pipelineId, sql`lower(${t.name})`),
    uniqueIndex("stages_pipeline_done_uq").on(t.pipelineId).where(sql`${t.isDone}`),
    index("stages_pipeline_position_idx").on(t.pipelineId, t.position, t.id),
  ],
);

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey(),
    boardId: uuid("board_id").notNull(),
    pipelineId: uuid("pipeline_id").notNull(),
    stageId: uuid("stage_id").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    priority: priority("priority").notNull(),
    status: taskStatus("status").notNull().default("active"),
    dueDate: date("due_date", { mode: "string" }),
    assigneeId: text("assignee_id"),
    completedAt: timestamptz("completed_at"),
    position: positionText("position").notNull(),
    createdAt: timestamptz("created_at").notNull(),
  },
  (t) => [
    foreignKey({ columns: [t.pipelineId, t.boardId], foreignColumns: [pipelines.id, pipelines.boardId], name: "tasks_pipeline_board_fk" })
      .onDelete("cascade"),
    foreignKey({ columns: [t.stageId, t.pipelineId], foreignColumns: [stages.id, stages.pipelineId], name: "tasks_stage_pipeline_fk" })
      .onDelete("cascade"),
    index("tasks_stage_position_idx").on(t.stageId, t.position, t.id),
    index("tasks_pipeline_idx").on(t.pipelineId),
    index("tasks_board_assignee_idx").on(t.boardId, t.assigneeId),
  ],
);

export const comments = pgTable(
  "comments",
  {
    id: uuid("id").primaryKey(),
    taskId: uuid("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
    boardId: uuid("board_id").notNull().references(() => boards.id, { onDelete: "cascade" }),
    authorId: text("author_id").notNull(),
    body: text("body").notNull(),
    createdAt: timestamptz("created_at").notNull(),
  },
  (t) => [index("comments_task_created_idx").on(t.taskId, t.createdAt)],
);

export const attachments = pgTable(
  "attachments",
  {
    id: uuid("id").primaryKey(),
    commentId: uuid("comment_id").references(() => comments.id, { onDelete: "cascade" }),
    boardId: uuid("board_id").notNull().references(() => boards.id, { onDelete: "cascade" }),
    uploaderId: text("uploader_id").notNull(),
    storageKey: text("storage_key").notNull().unique(),
    fileName: text("file_name").notNull(),
    contentType: text("content_type").notNull(),
    size: integer("size").notNull(),
    status: attachmentStatus("status").notNull().default("pending"),
    createdAt: timestamptz("created_at").notNull(),
  },
  (t) => [index("attachments_comment_idx").on(t.commentId), index("attachments_status_created_idx").on(t.status, t.createdAt)],
);

/** Outbox: keys of stored objects whose rows were deleted; processed after commit (slice 6). */
export const storageDeletions = pgTable(
  "storage_deletions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storageKey: text("storage_key").notNull(),
    attempts: integer("attempts").notNull().default(0),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    /** Lease: a row is claimable once this passes; claiming and failing push it into the future. */
    nextAttemptAt: timestamptz("next_attempt_at").notNull().defaultNow(),
  },
  (t) => [index("storage_deletions_due_idx").on(t.nextAttemptAt, t.createdAt)],
);

/** Fixed-window rate limiter state, one row per (key, window). */
export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text("key").notNull(),
    windowStart: timestamptz("window_start").notNull(),
    count: integer("count").notNull(),
  },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] })],
);
