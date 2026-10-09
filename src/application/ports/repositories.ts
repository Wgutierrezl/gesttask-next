import type { Board, BoardMember } from "@/domain/entities/board";
import type { Pipeline, Stage } from "@/domain/entities/pipeline";
import type { Task } from "@/domain/entities/task";
import type { BoardRole } from "@/domain/value-objects/board-role";

export interface Page {
  limit: number;
  offset: number;
}

export interface BoardRepo {
  insert(board: Board): Promise<void>;
  findById(id: string): Promise<Board | null>;
  listByMember(userId: string): Promise<Board[]>;
  update(board: Board): Promise<void>;
  /** Cascades to members, pipelines, stages and tasks. */
  delete(id: string): Promise<void>;
}

export interface MemberRepo {
  /** Throws ConflictError when `(boardId, userId)` already exists. */
  insert(member: BoardMember): Promise<void>;
  find(boardId: string, userId: string): Promise<BoardMember | null>;
  listByBoard(boardId: string): Promise<BoardMember[]>;
  listByUser(userId: string): Promise<BoardMember[]>;
  updateRole(boardId: string, userId: string, role: BoardRole): Promise<void>;
  remove(boardId: string, userId: string): Promise<void>;
  countByRole(boardId: string, role: BoardRole): Promise<number>;
}

export interface PipelineRepo {
  insert(pipeline: Pipeline): Promise<void>;
  findById(id: string): Promise<Pipeline | null>;
  listByBoard(boardId: string): Promise<Pipeline[]>;
  update(pipeline: Pipeline): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface StageRepo {
  insert(stage: Stage): Promise<void>;
  findById(id: string): Promise<Stage | null>;
  /** Ordered by position, then id. */
  listByPipeline(pipelineId: string): Promise<Stage[]>;
  update(stage: Stage): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface TaskRepo {
  insert(task: Task): Promise<void>;
  findById(id: string): Promise<Task | null>;
  update(task: Task): Promise<void>;
  delete(id: string): Promise<void>;
  /** Ordered by position, then id. */
  listByStage(stageId: string): Promise<Task[]>;
  /** Ordered by position, then id; paginated. */
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
