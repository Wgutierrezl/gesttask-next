import type { Repos, UnitOfWork } from "@/application/ports/repositories";
import { createInMemoryRepos } from "./in-memory-repos";
import type { InMemoryStore } from "./in-memory-store";

type Snapshot = { [K in keyof InMemoryStore]: [string, unknown][] };

function snapshot(store: InMemoryStore): Snapshot {
  return Object.fromEntries(
    Object.entries(store).map(([name, map]) => [name, structuredClone([...map.entries()])]),
  ) as Snapshot;
}

function restore(store: InMemoryStore, saved: Snapshot): void {
  for (const name of Object.keys(store) as (keyof InMemoryStore)[]) {
    const map = store[name] as Map<string, unknown>;
    map.clear();
    for (const [key, value] of saved[name]) map.set(key, value);
  }
}

/** Simulates a DB transaction: every write is undone if the work throws. */
export class FakeUnitOfWork implements UnitOfWork {
  constructor(
    private readonly store: InMemoryStore,
    private readonly now?: () => Date,
  ) {}

  async run<T>(work: (repos: Repos) => Promise<T>): Promise<T> {
    const saved = snapshot(this.store);
    try {
      return await work(createInMemoryRepos(this.store, { now: this.now }));
    } catch (error) {
      restore(this.store, saved);
      throw error;
    }
  }
}
