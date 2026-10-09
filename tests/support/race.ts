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
