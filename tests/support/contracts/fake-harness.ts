import type { InMemoryStore } from "@/infrastructure/repos/in-memory-store";

export function resetStore(store: InMemoryStore): void {
  for (const map of Object.values(store)) (map as Map<string, unknown>).clear();
}
