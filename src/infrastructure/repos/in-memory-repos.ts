import { ConflictError, NotFoundError } from "@/domain/errors";
import { comparePositions } from "@/domain/value-objects/position";
import type { Task } from "@/domain/entities/task";
import type { Stage } from "@/domain/entities/pipeline";
import type { Pipeline } from "@/domain/entities/pipeline";
import type { Page, Repos } from "@/application/ports/repositories";
import type { InMemoryStore } from "./in-memory-store";

const copy = <T>(value: T): T => structuredClone(value);
const copies = <T>(values: Iterable<T>): T[] => [...values].map(copy);
const slice = <T>(values: T[], page?: Page): T[] => (page ? values.slice(page.offset, page.offset + page.limit) : values);
const byText = (a: string, b: string) => comparePositions(a, b);
const byPositionThenId = (a: { position: string; id: string }, b: { position: string; id: string }) =>
  comparePositions(a.position, b.position) || comparePositions(a.id, b.id);

function dropWhere<V>(map: Map<string, V>, predicate: (value: V) => boolean): void {
  for (const [key, value] of map) if (predicate(value)) map.delete(key);
}

/** Fake repositories mirroring the Postgres semantics the real ones must honour (FK cascades, unique keys). */
export function createInMemoryRepos(store: InMemoryStore): Repos {
  const memberKey = (boardId: string, userId: string) => `${boardId}:${userId}`;
  const assertSingleDoneStage = (stage: Stage) => {
    if (!stage.isDone) return;
    for (const other of store.stages.values()) {
      if (other.id !== stage.id && other.pipelineId === stage.pipelineId && other.isDone) {
        throw new ConflictError("The pipeline already has a done stage");
      }
    }
  };
  const assertStageNameFree = (stage: Stage) => {
    const name = stage.name.toLowerCase();
    for (const other of store.stages.values()) {
      if (other.id !== stage.id && other.pipelineId === stage.pipelineId && other.name.toLowerCase() === name) {
        throw new ConflictError("A stage with this name already exists in the pipeline");
      }
    }
  };
  // The composite foreign keys of the real schema: a violation reads as a vanished parent (NotFoundError).
  const assertBoard = (boardId: string) => {
    if (!store.boards.has(boardId)) throw new NotFoundError();
  };
  const assertPipelineOnBoard = (pipelineId: string, boardId: string): Pipeline => {
    const pipeline = store.pipelines.get(pipelineId);
    if (!pipeline || pipeline.boardId !== boardId) throw new NotFoundError();
    return pipeline;
  };
  const assertTaskParents = (task: Task) => {
    assertPipelineOnBoard(task.pipelineId, task.boardId);
    if (store.stages.get(task.stageId)?.pipelineId !== task.pipelineId) throw new NotFoundError();
  };
  return {
    boards: {
      insert: async (board) => void store.boards.set(board.id, copy(board)),
      findById: async (id) => copy(store.boards.get(id) ?? null),
      listByMember: async (userId, page) => {
        const ids = new Set([...store.members.values()].filter((m) => m.userId === userId).map((m) => m.boardId));
        const boards = [...store.boards.values()].filter((b) => ids.has(b.id));
        boards.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || byText(a.id, b.id));
        return copies(slice(boards, page));
      },
      update: async (board) => void store.boards.set(board.id, copy(board)),
      delete: async (id) => {
        store.boards.delete(id);
        dropWhere(store.members, (m) => m.boardId === id);
        dropWhere(store.pipelines, (p) => p.boardId === id);
        dropWhere(store.stages, (s) => s.boardId === id);
        dropWhere(store.tasks, (t) => t.boardId === id);
      },
    },
    members: {
      insert: async (member) => {
        const key = memberKey(member.boardId, member.userId);
        assertBoard(member.boardId);
        if (store.members.has(key)) throw new ConflictError("User is already a member of this board");
        store.members.set(key, copy(member));
      },
      find: async (boardId, userId) => copy(store.members.get(memberKey(boardId, userId)) ?? null),
      listByBoard: async (boardId, page) =>
        copies(
          slice([...store.members.values()].filter((m) => m.boardId === boardId).sort((a, b) => byText(a.userId, b.userId)), page),
        ),
      listByUser: async (userId) => copies([...store.members.values()].filter((m) => m.userId === userId)),
      updateRole: async (boardId, userId, role) => {
        const member = store.members.get(memberKey(boardId, userId));
        if (member) member.role = role;
      },
      remove: async (boardId, userId) => void store.members.delete(memberKey(boardId, userId)),
      countByRole: async (boardId, role) =>
        [...store.members.values()].filter((m) => m.boardId === boardId && m.role === role).length,
    },
    pipelines: {
      insert: async (pipeline) => {
        assertBoard(pipeline.boardId);
        store.pipelines.set(pipeline.id, copy(pipeline));
      },
      findById: async (id) => copy(store.pipelines.get(id) ?? null),
      listByBoard: async (boardId, page) =>
        copies(
          slice(
            [...store.pipelines.values()]
              .filter((p) => p.boardId === boardId)
              .sort((a, b) => byText(a.name, b.name) || byText(a.id, b.id)),
            page,
          ),
        ),
      update: async (pipeline) => void store.pipelines.set(pipeline.id, copy(pipeline)),
      delete: async (id) => {
        store.pipelines.delete(id);
        dropWhere(store.stages, (s) => s.pipelineId === id);
        dropWhere(store.tasks, (t) => t.pipelineId === id);
      },
    },
    stages: {
      insert: async (stage) => {
        assertPipelineOnBoard(stage.pipelineId, stage.boardId);
        assertStageNameFree(stage);
        assertSingleDoneStage(stage);
        store.stages.set(stage.id, copy(stage));
      },
      findById: async (id) => copy(store.stages.get(id) ?? null),
      listByPipeline: async (pipelineId, page) =>
        copies(slice([...store.stages.values()].filter((s) => s.pipelineId === pipelineId).sort(byPositionThenId), page)),
      update: async (stage) => {
        assertPipelineOnBoard(stage.pipelineId, stage.boardId);
        assertStageNameFree(stage);
        assertSingleDoneStage(stage);
        store.stages.set(stage.id, copy(stage));
      },
      delete: async (id) => {
        store.stages.delete(id);
        dropWhere(store.tasks, (t) => t.stageId === id);
      },
    },
    tasks: {
      insert: async (task) => {
        assertTaskParents(task);
        store.tasks.set(task.id, copy(task));
      },
      findById: async (id) => copy(store.tasks.get(id) ?? null),
      update: async (task) => {
        assertTaskParents(task);
        store.tasks.set(task.id, copy(task));
      },
      delete: async (id) => void store.tasks.delete(id),
      clearAssignee: async (boardId, userId) => {
        for (const task of store.tasks.values()) {
          if (task.boardId === boardId && task.assigneeId === userId) task.assigneeId = null;
        }
      },
      listByStage: async (stageId) =>
        copies([...store.tasks.values()].filter((t) => t.stageId === stageId).sort(byPositionThenId)),
      listByPipeline: async (pipelineId, page) => {
        const stages = new Map([...store.stages.values()].map((s) => [s.id, s]));
        const stageOrder = (task: Task) => stages.get(task.stageId) ?? { id: task.stageId, position: "" };
        const tasks = [...store.tasks.values()].filter((t) => t.pipelineId === pipelineId);
        tasks.sort((a, b) => byPositionThenId(stageOrder(a), stageOrder(b)) || byPositionThenId(a, b));
        return copies(slice(tasks, page));
      },
    },
  };
}
