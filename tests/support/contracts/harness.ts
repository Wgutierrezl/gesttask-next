import { randomUUID } from "node:crypto";
import type { Repos, UnitOfWork } from "@/application/ports/repositories";
import type { Board } from "@/domain/entities/board";
import type { Attachment, Comment } from "@/domain/entities/comment";
import type { Pipeline, Stage } from "@/domain/entities/pipeline";
import type { Task } from "@/domain/entities/task";

/** What a repository contract needs from an implementation (in-memory fakes or Drizzle adapters). */
export interface RepoHarness {
  /** Non-transactional repositories (`AppDeps.repos`). */
  repos: Repos;
  uow: UnitOfWork;
  /** Empties every table/map before each test. */
  reset(): Promise<void>;
  close?(): Promise<void>;
}

export const uuid = (): string => randomUUID();
export const T0 = new Date("2026-10-09T12:00:00.000Z");
export const at = (offsetSeconds: number): Date => new Date(T0.getTime() + offsetSeconds * 1000);

export const makeBoard = (extra: Partial<Board> = {}): Board => ({
  id: uuid(), name: "Board", description: "", status: "active", createdAt: T0, ...extra,
});

export const makePipeline = (boardId: string, extra: Partial<Pipeline> = {}): Pipeline => ({
  id: uuid(), boardId, name: "Pipeline", description: "", ...extra,
});

export const makeStage = (pipeline: Pipeline, extra: Partial<Stage> = {}): Stage => ({
  id: uuid(), pipelineId: pipeline.id, boardId: pipeline.boardId, name: `Stage ${uuid()}`, isDone: false, position: "a0", ...extra,
});

/** A board with one pipeline: the smallest parent chain the child repositories need (FKs are real). */
export async function seedPipeline(h: RepoHarness): Promise<{ board: Board; pipeline: Pipeline }> {
  const board = makeBoard();
  const pipeline = makePipeline(board.id);
  await h.repos.boards.insert(board);
  await h.repos.pipelines.insert(pipeline);
  return { board, pipeline };
}

export const makeTask = (stage: Stage, extra: Partial<Task> = {}): Task => ({
  id: uuid(), boardId: stage.boardId, pipelineId: stage.pipelineId, stageId: stage.id, title: "Task", description: "",
  priority: "medium", status: "active", dueDate: null, assigneeId: null, completedAt: null, position: "a0", createdAt: T0,
  ...extra,
});

/** A board, one pipeline and one stage: the parent chain a task needs. */
export async function seedStage(h: RepoHarness, stageExtra: Partial<Stage> = {}) {
  const { board, pipeline } = await seedPipeline(h);
  const stage = makeStage(pipeline, stageExtra);
  await h.repos.stages.insert(stage);
  return { board, pipeline, stage };
}

/** A board, pipeline, stage and one task: the parent chain a comment needs. */
export async function seedTask(h: RepoHarness) {
  const seeded = await seedStage(h);
  const task = makeTask(seeded.stage);
  await h.repos.tasks.insert(task);
  return { ...seeded, task };
}

export const makeComment = (task: Task, extra: Partial<Comment> = {}): Comment => ({
  id: uuid(), taskId: task.id, boardId: task.boardId, authorId: "author", body: "A comment", createdAt: T0, ...extra,
});

export const makeAttachment = (boardId: string, extra: Partial<Attachment> = {}): Attachment => {
  const id = uuid();
  return {
    id, commentId: null, boardId, uploaderId: "author", storageKey: `boards/${boardId}/attachments/${id}`, fileName: "photo.png",
    contentType: "image/png", size: 1024, status: "pending", createdAt: T0, ...extra,
  };
};
