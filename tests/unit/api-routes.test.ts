import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildUseCases } from "@/infrastructure/use-cases";
import { createTestContext } from "@tests/support/app-context";
import { InMemoryRateLimiter } from "@/infrastructure/ratelimit/in-memory-rate-limiter";
import { InMemoryUserDirectory } from "@/infrastructure/repos/in-memory-users";
import { FakeStorage } from "@tests/support/fake-storage";
import { OPERATIONS } from "@/openapi/operations";

const root = fileURLToPath(new URL("../../src/app/api/v1/", import.meta.url));
const METHODS = ["GET", "POST", "PATCH", "DELETE"] as const;

/** `METHOD /path` for every handler exported by a route file under /api/v1, with `[id]` folders as `{id}`. */
function servedRoutes(): string[] {
  const files = (readdirSync(root, { recursive: true }) as string[]).filter((f) => f.endsWith("/route.ts") || f === "route.ts");
  return files.flatMap((file) => {
    const path = "/" + file.replace(/\/?route\.ts$/, "").replace(/\[(\w+)\]/g, "{$1}");
    const source = readFileSync(root + file, "utf8");
    return METHODS.filter((m) => new RegExp(`export const ${m}\\b`).test(source)).map((m) => `${m} ${path === "/" ? "" : path}`);
  });
}

describe("the declared operations and the routes on disk are one set", () => {
  const declared = OPERATIONS.map((o) => `${o.method.toUpperCase()} ${o.path}`);

  it("every route file serves a declared operation, and every declared operation has a route", () => {
    const served = servedRoutes().filter((route) => !route.endsWith("/openapi.json"));
    expect(served.sort()).toEqual(declared.sort());
  });

  it("operation ids are unique", () => {
    expect(new Set(OPERATIONS.map((o) => o.id)).size).toBe(OPERATIONS.length);
  });

  it("every operation id is a use case of the registry, and path params match the template", () => {
    const ctx = createTestContext();
    const registry = buildUseCases(ctx, { users: new InMemoryUserDirectory(), limiter: new InMemoryRateLimiter(ctx.clock), clientKey: async () => "c", storage: new FakeStorage() });
    for (const operation of OPERATIONS) {
      expect(Object.keys(registry), operation.id).toContain(operation.id);
      const inTemplate = [...operation.path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
      expect(Object.keys(operation.params?.shape ?? {}).sort(), operation.path).toEqual(inTemplate);
    }
  });

  it("every operation documents a success response", () => {
    for (const operation of OPERATIONS) expect(operation.response, operation.id).toBeDefined();
  });
});
