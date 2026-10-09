import { ConflictError } from "@/domain/errors";
import type { Stage } from "@/domain/entities/pipeline";
import { isTerminalStage } from "@/domain/entities/pipeline";
import { resolveCompletedAt } from "@/domain/entities/task";
import type { Repos } from "../../ports/repositories";

/** Stage names are unique per pipeline, ignoring case and surrounding whitespace (REQ-PIP-01). */
export function assertNameAvailable(siblings: readonly Stage[], name: string, exceptId?: string): void {
  const taken = siblings.some((s) => s.id !== exceptId && s.name.toLowerCase() === name.toLowerCase());
  if (taken) throw new ConflictError("A stage with this name already exists in the pipeline");
}

/**
 * Whichever stage is last defines "completed". After any structural change, re-derive
 * `completedAt` for the whole pipeline so no task is stranded with a stale flag (REQ-TSK-05).
 */
export async function syncCompletion(tx: Repos, pipelineId: string, now: Date): Promise<void> {
  const stages = await tx.stages.listByPipeline(pipelineId);
  for (const stage of stages) {
    const terminal = isTerminalStage(stage.id, stages);
    for (const task of await tx.tasks.listByStage(stage.id)) {
      const completedAt = resolveCompletedAt(task.completedAt, terminal, now);
      if (completedAt?.getTime() !== task.completedAt?.getTime()) await tx.tasks.update({ ...task, completedAt });
    }
  }
}
