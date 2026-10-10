import { createTestContext } from "@tests/support/app-context";
import { runCommentContract } from "@tests/support/contracts/comments.contract";
import { resetStore } from "@tests/support/contracts/fake-harness";

runCommentContract("in-memory fakes", () => {
  const ctx = createTestContext();
  return { repos: ctx.repos, uow: ctx.uow, reset: async () => resetStore(ctx.store) };
});
