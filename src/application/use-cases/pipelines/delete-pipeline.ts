import { NotFoundError } from "@/domain/errors";
import type { Actor } from "../../actor";
import type { AppDeps } from "../../deps";
import { parseInput } from "../../schemas/parse";
import { pipelineIdSchema } from "../../schemas/pipeline";
import { loadPipeline } from "../../resources";
import { enqueueAttachmentCleanup } from "../../storage-cleanup";

/**
 * Stages and tasks are removed with the pipeline in a single transaction (REQ-PIP-03); the storage keys of their
 * comments' attachments are queued in that same transaction (REQ-CAS-02).
 */
export function makeDeletePipeline(deps: AppDeps) {
  return async (actor: Actor, input: unknown): Promise<void> => {
    const { pipelineId } = parseInput(pipelineIdSchema, input);
    await loadPipeline(deps.repos, actor, pipelineId, "pipeline:manage");
    await deps.uow.run(async (tx) => {
      if (!(await tx.pipelines.findById(pipelineId))) throw new NotFoundError();
      await enqueueAttachmentCleanup(tx, { pipelineId });
      await tx.pipelines.delete(pipelineId);
    });
  };
}
