import type { Board, BoardMember } from "@/domain/entities/board";
import type { Attachment, Comment } from "@/domain/entities/comment";
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
  comments: Map<string, Comment>;
  attachments: Map<string, Attachment>;
  /** The deletion outbox, keyed by row id. */
  storageDeletions: Map<string, InMemoryDeletion>;
}

export interface InMemoryDeletion {
  id: string;
  storageKey: string;
  attempts: number;
  createdAt: number;
  nextAttemptAt: number;
  deadAt: number | null;
}

export function createStore(): InMemoryStore {
  return {
    boards: new Map(), members: new Map(), pipelines: new Map(), stages: new Map(), tasks: new Map(),
    comments: new Map(), attachments: new Map(), storageDeletions: new Map(),
  };
}
