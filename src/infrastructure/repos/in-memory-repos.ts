import { ConflictError } from "@/domain/errors";
import { comparePositions } from "@/domain/value-objects/position";
import type { Stage } from "@/domain/entities/pipeline";
import type { Repos } from "@/application/ports/repositories";
import type { InMemoryStore } from "./in-memory-store";

const copy = <T>(value: T): T => structuredClone(value);
const copies = <T>(values: Iterable<T>): T[] => [...values].map(copy);
const byPositionThenId = (a: { position: string; id: string }, b: { position: string; id: string }) =>
  comparePositions(a.position, b.position) || comparePositions(a.id, b.id);

function dropWhere<V>(map: Map<string, V>, predicate: (value: V) => boolean): void {
  for (const [key, value] of map) if (predicate(value)) map.delete(key);
}

/** Fake repositories mirroring the Postgres semantics the real ones must honour (FK cascades, unique keys). */
export function createInMemoryRepos(store: InMemoryStore): Repos {
  const memberKey = (boardId: string, userId: string) => `${boardId}:${userId}`;
  const assertStageNameFree = (stage: Stage) => {
    const name = stage.name.toLowerCase();
    for (const other of store.stages.values()) {
      if (other.id !== stage.id && other.pipelineId === stage.pipelineId && other.name.toLowerCase() === name) {
        throw new ConflictError("A stage with this name already exists in the pipeline");
      }
    }
  };
  return {
    boards: {
      insert: async (board) => void store.boards.set(board.id, copy(board)),
      findById: async (id) => copy(store.boards.get(id) ?? null),
      listByMember: async (userId) => {
        const ids = new Set([...store.members.values()].filter((m) => m.userId === userId).map((m) => m.boardId));
        return copies([...store.boards.values()].filter((b) => ids.has(b.id)));
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
        if (store.members.has(key)) throw new ConflictError("User is already a member of this board");
        store.members.set(key, copy(member));
      },
      find: async (boardId, userId) => copy(store.members.get(memberKey(boardId, userId)) ?? null),
      listByBoard: async (boardId) => copies([...store.members.values()].filter((m) => m.boardId === boardId)),
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
      insert: async (pipeline) => void store.pipelines.set(pipeline.id, copy(pipeline)),
      findById: async (id) => copy(store.pipelines.get(id) ?? null),
      listByBoard: async (boardId) => copies([...store.pipelines.values()].filter((p) => p.boardId === boardId)),
      update: async (pipeline) => void store.pipelines.set(pipeline.id, copy(pipeline)),
      delete: async (id) => {
        store.pipelines.delete(id);
        dropWhere(store.stages, (s) => s.pipelineId === id);
        dropWhere(store.tasks, (t) => t.pipelineId === id);
      },
    },
    stages: {
      insert: async (stage) => {
        assertStageNameFree(stage);
        store.stages.set(stage.id, copy(stage));
      },
      findById: async (id) => copy(store.stages.get(id) ?? null),
      listByPipeline: async (pipelineId) =>
        copies([...store.stages.values()].filter((s) => s.pipelineId === pipelineId).sort(byPositionThenId)),
      update: async (stage) => {
        assertStageNameFree(stage);
        store.stages.set(stage.id, copy(stage));
      },
      delete: async (id) => {
        store.stages.delete(id);
        dropWhere(store.tasks, (t) => t.stageId === id);
      },
    },
    tasks: {
      insert: async (task) => void store.tasks.set(task.id, copy(task)),
      findById: async (id) => copy(store.tasks.get(id) ?? null),
      update: async (task) => void store.tasks.set(task.id, copy(task)),
      delete: async (id) => void store.tasks.delete(id),
      clearAssignee: async (boardId, userId) => {
        for (const task of store.tasks.values()) {
          if (task.boardId === boardId && task.assigneeId === userId) task.assigneeId = null;
        }
      },
      listByStage: async (stageId) =>
        copies([...store.tasks.values()].filter((t) => t.stageId === stageId).sort(byPositionThenId)),
      listByPipeline: async (pipelineId, { limit, offset }) =>
        copies(
          [...store.tasks.values()]
            .filter((t) => t.pipelineId === pipelineId)
            .sort(byPositionThenId)
            .slice(offset, offset + limit),
        ),
    },
  };
}
