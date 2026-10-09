import { isTerminalStage } from "@/domain/entities/pipeline";
import { resolveCompletedAt } from "@/domain/entities/task";
import type { Repos } from "../../ports/repositories";

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
