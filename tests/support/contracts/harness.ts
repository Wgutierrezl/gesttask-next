import { randomUUID } from "node:crypto";
import type { Repos, UnitOfWork } from "@/application/ports/repositories";
import type { Board } from "@/domain/entities/board";

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
