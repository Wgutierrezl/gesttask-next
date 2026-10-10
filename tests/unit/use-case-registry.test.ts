import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { NotFoundError, UnauthenticatedError } from "@/domain/errors";
import { guardAll } from "@/application/require-actor";
import { buildUseCases } from "@/infrastructure/use-cases";
import { InMemoryRateLimiter } from "@/infrastructure/ratelimit/in-memory-rate-limiter";
import { InMemoryUserDirectory } from "@/infrastructure/repos/in-memory-users";
import { FakeStorage } from "@tests/support/fake-storage";
import { createTestContext } from "@tests/support/app-context";
import { STRANGER } from "@tests/support/fixtures";

const camel = (file: string) => file.replace(/\.ts$/, "").split("/").pop()!.replace(/-(\w)/g, (_m, c: string) => c.toUpperCase());
const root = fileURLToPath(new URL("../../src/application/use-cases/", import.meta.url));
const protectedFiles = (readdirSync(root, { recursive: true }) as string[])
  .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && !f.split("/").pop()!.startsWith("_") && !f.startsWith("auth/"));

describe("use-case registry (composition root)", () => {
  const ctx = createTestContext();
  const registry = buildUseCases(ctx, { users: new InMemoryUserDirectory(), limiter: new InMemoryRateLimiter(ctx.clock), clientKey: async () => "c", storage: new FakeStorage() });

  it("registers every non-public use case on disk under its camelCase name, and nothing else", () => {
    expect(Object.keys(registry).sort()).toEqual(protectedFiles.map(camel).sort());
  });

  it("answers Unauthenticated for every registered use case when wrapped with a session that has no actor", async () => {
    const guarded = guardAll({ getActor: async () => null }, registry);
    for (const [name, call] of Object.entries(guarded)) {
      const error = await (call as (input: unknown) => Promise<unknown>)({}).catch((e: unknown) => e);
      expect(error, name).toBeInstanceOf(UnauthenticatedError);
    }
  });

  it("runs as the session's actor once signed in", async () => {
    const guarded = guardAll({ getActor: async () => STRANGER }, registry);
    expect(await guarded.listMyBoards({})).toEqual([]);
    await expect(guarded.getBoard({ boardId: "00000000-0000-4000-8000-00000000ffff" })).rejects.toBeInstanceOf(NotFoundError);
  });
});
