import { createTestContext } from "@tests/support/app-context";
import { resetStore } from "@tests/support/contracts/fake-harness";
import { runDashboardContract } from "@tests/support/contracts/dashboard.contract";

runDashboardContract("in-memory fakes", () => {
  const ctx = createTestContext();
  return { repos: ctx.repos, uow: ctx.uow, reset: async () => resetStore(ctx.store) };
});
