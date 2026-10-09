import { createTestContext } from "@tests/support/app-context";
import { runBoardContract } from "@tests/support/contracts/boards.contract";
import { resetStore } from "@tests/support/contracts/fake-harness";

runBoardContract("in-memory fakes", () => {
  const ctx = createTestContext();
  return { repos: ctx.repos, uow: ctx.uow, reset: async () => resetStore(ctx.store) };
});
