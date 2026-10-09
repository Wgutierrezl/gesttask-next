import type { TestContext } from "./app-context";

/**
 * Simulates another writer committing between a use case's pre-flight reads and its transaction:
 * `write` runs once, right before the first unit of work starts. Use cases that read-modify-write
 * outside the transaction lose that write; the ones that re-read inside it keep it.
 */
export function withInterleavedWrite(ctx: TestContext, write: (store: TestContext["store"]) => void): TestContext {
  let pending = true;
  return {
    ...ctx,
    uow: {
      run: (work) => {
        if (pending) {
          pending = false;
          write(ctx.store);
        }
        return ctx.uow.run(work);
      },
    },
  };
}

/**
 * Wraps the unit of work so every call a use case makes through the transactional repos is logged as
 * `"<repo>.<method>"`, in order. Used to pin the global lock order (see application/ports/repositories.ts).
 */
export function recordTxCalls(ctx: TestContext): { ctx: TestContext; calls: string[] } {
  const calls: string[] = [];
  const spy = <T extends object>(name: string, repo: T): T =>
    new Proxy(repo, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver);
        if (typeof value !== "function") return value;
        return (...args: unknown[]) => {
          calls.push(`${name}.${String(prop)}`);
          return value.apply(target, args);
        };
      },
    });
  return {
    calls,
    ctx: {
      ...ctx,
      uow: {
        run: (work) =>
          ctx.uow.run((tx) =>
            work({
              boards: spy("boards", tx.boards),
              members: spy("members", tx.members),
              pipelines: spy("pipelines", tx.pipelines),
              stages: spy("stages", tx.stages),
              tasks: spy("tasks", tx.tasks),
            }),
          ),
      },
    },
  };
}
