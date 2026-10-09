import { createTestContext } from "@tests/support/app-context";
import { resetStore } from "@tests/support/contracts/fake-harness";
import { runSeedContract } from "@tests/support/contracts/seed.contract";

runSeedContract("in-memory fakes", () => {
  const ctx = createTestContext();
  return { repos: ctx.repos, uow: ctx.uow, reset: async () => resetStore(ctx.store) };
});
