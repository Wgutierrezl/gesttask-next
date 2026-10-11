import type { SeedFiles } from "@/infrastructure/seed/seed-demo-board";

/** An object store that only remembers what was put and not yet deleted. */
export function memoryFiles() {
  const objects = new Map<string, { contentType: string; size: number }>();
  const puts: string[] = [];
  const files: SeedFiles = {
    async put(key, contentType, bytes) {
      puts.push(key);
      objects.set(key, { contentType, size: bytes.byteLength });
    },
    async delete(keys) {
      for (const key of keys) objects.delete(key);
    },
  };
  return { files, objects, puts };
}
