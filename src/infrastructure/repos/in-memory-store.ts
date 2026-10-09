import type { Board, BoardMember } from "@/domain/entities/board";
import type { Pipeline, Stage } from "@/domain/entities/pipeline";
import type { Task } from "@/domain/entities/task";

/** Plain maps standing in for tables; shared by the fake repositories and the fake unit of work. */
export interface InMemoryStore {
  boards: Map<string, Board>;
  /** Keyed by `${boardId}:${userId}`. */
  members: Map<string, BoardMember>;
  pipelines: Map<string, Pipeline>;
  stages: Map<string, Stage>;
  tasks: Map<string, Task>;
}

export function createStore(): InMemoryStore {
  return { boards: new Map(), members: new Map(), pipelines: new Map(), stages: new Map(), tasks: new Map() };
}
