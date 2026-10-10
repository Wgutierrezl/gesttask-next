import type { Board, BoardMember } from "@/domain/entities/board";
import type { Attachment, Comment } from "@/domain/entities/comment";
import type { Pipeline, Stage } from "@/domain/entities/pipeline";
import type { Task } from "@/domain/entities/task";
import type { BoardRole } from "@/domain/value-objects/board-role";
import type { StorageDeletionOutbox } from "./services";

export interface Page {
  limit: number;
  offset: number;
}

/**
 * Concurrency contract for every repository handed out by `UnitOfWork.run`:
 * - Reads performed through the transaction's repos MUST lock the rows they return
 *   (`SELECT ... FOR UPDATE`), so read-modify-write inside `run` cannot lose updates. Reads through
 *   `AppDeps.repos` (outside a transaction) are plain snapshots meant for authorization and listing.
 * - GLOBAL LOCK ORDER (deadlock freedom). Use cases lock in this order and never go back:
 *   boards, members (owner rows first, then the target member), pipelines, stages, tasks, then comments and
 *   attachments (a delete locks the tasks below it, in this order, before reading attachment keys). A writer that
 *   inserts a child of the board (comment, pending upload) takes a KEY SHARE on the board for its foreign key, so it
 *   locks the board row BEFORE its task, or it would deadlock with a board delete. Within one
 *   type, rows are locked by primary key, and a use case that needs both a list and one of its rows
 *   locks the LIST first and picks the target from it (never row, then list). Use cases that touch
 *   several task columns lock the columns in stage-id order.
 * - Locking list methods (`listByPipeline`, `listByStage`, ...) therefore MUST lock the rows ordered by
 *   primary key and return them position-ordered. Infra pattern, as TWO statements:
 *     SELECT id FROM t WHERE <filter> ORDER BY id FOR UPDATE;   -- acquires the locks in PK order
 *     SELECT ... FROM t WHERE <filter> ORDER BY position, id;    -- then reads with a fresh snapshot
 *   A plain `ORDER BY position FOR UPDATE` locks in position order (deadlock-prone), and folding both
 *   into `WHERE id IN (SELECT ... FOR UPDATE)` reads with the snapshot taken before the lock wait, so
 *   rows committed by the transaction we waited for come back stale (lost updates).
 * - Lists scoped to a parent (`stages.listByPipeline`, `tasks.listByStage`) lock the PARENT row first
 *   (FOR UPDATE conflicts with the KEY SHARE lock every child insert/move takes for its foreign key), so
 *   no row can appear in the list while a transaction is using it. The lock order stays top-down.
 * - PAGINATED listings (`listByMember`, `listByBoard`, `listByPipeline` with a `Page`) are snapshot reads
 *   even inside a transaction: they feed the UI and are never used to read-modify-write.
 * - Uniqueness is enforced by the database, never by check-then-insert in application code: the
 *   violating insert/update throws `ConflictError`.
 */
export interface BoardRepo {
  insert(board: Board): Promise<void>;
  findById(id: string): Promise<Board | null>;
  /** Ordered by createdAt, then id; paginated. */
  listByMember(userId: string, page: Page): Promise<Board[]>;
  update(board: Board): Promise<void>;
  /** Cascades to members, pipelines, stages and tasks. */
  delete(id: string): Promise<void>;
}

export interface MemberRepo {
  /** Throws ConflictError when `(boardId, userId)` already exists (unique key, race-free). */
  insert(member: BoardMember): Promise<void>;
  find(boardId: string, userId: string): Promise<BoardMember | null>;
  /** Ordered by userId; paginated. */
  listByBoard(boardId: string, page: Page): Promise<BoardMember[]>;
  listByUser(userId: string): Promise<BoardMember[]>;
  /** The user's memberships restricted to the given boards (the page on screen), so listings never load them all. */
  listByUserInBoards(userId: string, boardIds: readonly string[]): Promise<BoardMember[]>;
  /**
   * Serializes the quota checks of one user: takes a transaction-scoped lock that concurrent transactions of
   * the same user wait on until commit. Only valid inside a unit of work; a snapshot-read repo must refuse.
   */
  lockUserQuota(userId: string): Promise<void>;
  updateRole(boardId: string, userId: string, role: BoardRole): Promise<void>;
  remove(boardId: string, userId: string): Promise<void>;
  /**
   * Inside a transaction this MUST lock the board's owner rows (or the board row), so two
   * concurrent demotions/removals cannot both observe "another owner exists" (REQ-BRD-04).
   */
  countByRole(boardId: string, role: BoardRole): Promise<number>;
}

export interface PipelineRepo {
  insert(pipeline: Pipeline): Promise<void>;
  findById(id: string): Promise<Pipeline | null>;
  /** Ordered by name, then id; paginated. */
  listByBoard(boardId: string, page: Page): Promise<Pipeline[]>;
  update(pipeline: Pipeline): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface StageRepo {
  /** Throws ConflictError on a `(pipelineId, lower(name))` unique violation; same for `update`. */
  insert(stage: Stage): Promise<void>;
  findById(id: string): Promise<Stage | null>;
  /** Ordered by position, then id; without `page` returns the whole pipeline (transactional use). */
  listByPipeline(pipelineId: string, page?: Page): Promise<Stage[]>;
  update(stage: Stage): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface TaskRepo {
  insert(task: Task): Promise<void>;
  findById(id: string): Promise<Task | null>;
  update(task: Task): Promise<void>;
  delete(id: string): Promise<void>;
  /** Sets `assigneeId` to null on every task of the board assigned to the user. */
  clearAssignee(boardId: string, userId: string): Promise<void>;
  /** Number of tasks across the given boards (0 for none); backs the guest quota. */
  countByBoards(boardIds: string[]): Promise<number>;
  /** Ordered by position, then id. */
  listByStage(stageId: string): Promise<Task[]>;
  /** Ordered by stage position, stage id, task position, task id; paginated, columns never interleave. */
  listByPipeline(pipelineId: string, page: Page): Promise<Task[]>;
}

export interface CommentRepo {
  /** Throws NotFoundError when the task does not exist on `comment.boardId` (composite foreign key). */
  insert(comment: Comment): Promise<void>;
  findById(id: string): Promise<Comment | null>;
  /** Oldest first, then id; paginated (a snapshot read). */
  listByTask(taskId: string, page: Page): Promise<Comment[]>;
  updateBody(id: string, body: string): Promise<void>;
  /** Cascades to the comment's attachments. */
  delete(id: string): Promise<void>;
}

/** What a delete removes along the way, expressed by the row it targets. */
export type AttachmentScope =
  | { boardId: string }
  | { pipelineId: string }
  | { stageId: string }
  | { taskId: string }
  | { commentId: string };

export interface AttachmentRepo {
  /** A new upload starts `pending`, without a comment. Throws ConflictError on a duplicated storage key. */
  insert(attachment: Attachment): Promise<void>;
  findById(id: string): Promise<Attachment | null>;
  /** Unknown ids are left out. Inside a transaction the rows are locked in primary-key order. */
  findManyByIds(ids: readonly string[]): Promise<Attachment[]>;
  /** Links a pending attachment to its comment and records the size the storage reported. */
  confirm(id: string, link: { commentId: string; size: number }): Promise<void>;
  /** Confirmed attachments of the given comments, oldest first, then id. */
  listByComments(commentIds: readonly string[]): Promise<Attachment[]>;
  /** Confirmed uploads of the user plus pending ones created at or after `pendingSince` (abandoned ones do not count). */
  countByUploader(userId: string, pendingSince: Date): Promise<number>;
  /**
   * Storage keys of every attachment row that disappears when the scope is deleted (a board scope includes pending
   * uploads, which have no comment). Inside a transaction it first locks the tasks below the scope, so a comment
   * being created concurrently cannot attach an object this read missed; callers lock the scope's own row first.
   */
  keysUnder(scope: AttachmentScope): Promise<string[]>;
}

/** Repositories bound to the same transaction scope. */
export interface Repos {
  boards: BoardRepo;
  members: MemberRepo;
  pipelines: PipelineRepo;
  stages: StageRepo;
  tasks: TaskRepo;
  comments: CommentRepo;
  attachments: AttachmentRepo;
  /** Bound to the transaction in a unit of work: enqueued keys exist only if the whole transaction commits. */
  outbox: StorageDeletionOutbox;
}

/** Runs `work` atomically: any throw rolls back every write made through the given repos. */
export interface UnitOfWork {
  run<T>(work: (repos: Repos) => Promise<T>): Promise<T>;
}
