import type { Board, BoardMember } from "@/domain/entities/board";
import type { Pipeline, Stage } from "@/domain/entities/pipeline";
import type { Task } from "@/domain/entities/task";
import type { BoardRole } from "@/domain/value-objects/board-role";

export interface Page {
  limit: number;
  offset: number;
}

/**
 * Concurrency contract for every repository handed out by `UnitOfWork.run`:
 * - Reads performed through the transaction's repos MUST lock the rows they return
 *   (`SELECT ... FOR UPDATE`), so read-modify-write inside `run` cannot lose updates. Reads through
 *   `AppDeps.repos` (outside a transaction) are plain snapshots meant for authorization and listing.
 * - List reads that lock MUST lock in a deterministic order (by primary key) to avoid deadlocks.
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
  /** Ordered by position, then id. */
  listByStage(stageId: string): Promise<Task[]>;
  /** Ordered by stage position, stage id, task position, task id; paginated, columns never interleave. */
  listByPipeline(pipelineId: string, page: Page): Promise<Task[]>;
}

/** Repositories bound to the same transaction scope. */
export interface Repos {
  boards: BoardRepo;
  members: MemberRepo;
  pipelines: PipelineRepo;
  stages: StageRepo;
  tasks: TaskRepo;
}

/** Runs `work` atomically: any throw rolls back every write made through the given repos. */
export interface UnitOfWork {
  run<T>(work: (repos: Repos) => Promise<T>): Promise<T>;
}
