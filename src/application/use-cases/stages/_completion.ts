import { resolveCompletedAt } from "@/domain/entities/task";
import type { Repos } from "../../ports/repositories";

/** Re-derives `completedAt` for the tasks of one stage after its done flag changed. Only differing rows are written. */
export async function recomputeCompletion(tx: Repos, stageId: string, inDoneStage: boolean, now: Date): Promise<void> {
  for (const task of await tx.tasks.listByStage(stageId)) {
    const completedAt = resolveCompletedAt(task.completedAt, inDoneStage, now);
    if (completedAt?.getTime() !== task.completedAt?.getTime()) await tx.tasks.update({ ...task, completedAt });
  }
}
