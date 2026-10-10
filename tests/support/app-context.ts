import type { AppDeps } from "@/application/deps";
import type { Repos } from "@/application/ports/repositories";
import { createInMemoryRepos } from "@/infrastructure/repos/in-memory-repos";
import { createStore, type InMemoryStore } from "@/infrastructure/repos/in-memory-store";
import { FakeUnitOfWork } from "@/infrastructure/repos/in-memory-unit-of-work";

export interface TestContext extends AppDeps {
  store: InMemoryStore;
  repos: Repos;
  clock: { now(): Date; set(date: Date): void };
}

/** UUID-shaped, deterministic ids so schemas that require UUIDs accept them. */
export function sequentialIds(prefix = "0"): { next(): string } {
  let n = 0;
  return { next: () => `${prefix.repeat(8)}-0000-4000-8000-${(++n).toString(16).padStart(12, "0")}` };
}

export function createTestContext(): TestContext {
  const store = createStore();
  let current = new Date("2026-10-09T12:00:00.000Z");
  const now = () => current;
  return {
    store,
    repos: createInMemoryRepos(store, { now }),
    uow: new FakeUnitOfWork(store, now),
    clock: { now, set: (date) => void (current = date) },
    ids: sequentialIds(),
  };
}
