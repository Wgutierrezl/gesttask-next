import { createTestContext } from "@tests/support/app-context";
import { resetStore } from "@tests/support/contracts/fake-harness";
import { runTaskContract } from "@tests/support/contracts/tasks.contract";

runTaskContract("in-memory fakes", () => {
  const ctx = createTestContext();
  return { repos: ctx.repos, uow: ctx.uow, reset: async () => resetStore(ctx.store) };
});
