import { createTestContext } from "@tests/support/app-context";
import { resetStore } from "@tests/support/contracts/fake-harness";
import { runPipelineContract } from "@tests/support/contracts/pipelines.contract";

runPipelineContract("in-memory fakes", () => {
  const ctx = createTestContext();
  return { repos: ctx.repos, uow: ctx.uow, reset: async () => resetStore(ctx.store) };
});
