import { beforeEach, describe, expect, it } from "vitest";
import { NotFoundError, ValidationError } from "@/domain/errors";
import { createTestContext, type TestContext } from "@tests/support/app-context";
import { GUEST, MEMBER, OWNER, STRANGER, seedKanban } from "@tests/support/fixtures";
import { makeGetPipeline } from "./get-pipeline";

describe("getPipeline", () => {
  let ctx: TestContext;
  let ids: Awaited<ReturnType<typeof seedKanban>>;
  beforeEach(async () => {
    ctx = createTestContext();
    ids = await seedKanban(ctx);
  });

  it("returns the pipeline with the caller's own role on its board", async () => {
    const owner = await makeGetPipeline(ctx)(OWNER, { pipelineId: ids.pipelineId });
    expect(owner).toMatchObject({ pipeline: { id: ids.pipelineId, boardId: ids.boardId, name: "P" }, role: "owner" });
    expect((await makeGetPipeline(ctx)(MEMBER, { pipelineId: ids.pipelineId })).role).toBe("member");
    expect((await makeGetPipeline(ctx)(GUEST, { pipelineId: ids.pipelineId })).role).toBe("guest");
  });

  it("answers NotFound to non-members and unknown ids, and Validation to malformed ones", async () => {
    await expect(makeGetPipeline(ctx)(STRANGER, { pipelineId: ids.pipelineId })).rejects.toBeInstanceOf(NotFoundError);
    await expect(makeGetPipeline(ctx)(OWNER, { pipelineId: "00000000-0000-4000-8000-00000000ffff" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(makeGetPipeline(ctx)(OWNER, { pipelineId: "nope" })).rejects.toBeInstanceOf(ValidationError);
  });
});
