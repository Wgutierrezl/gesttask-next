import { NotFoundError } from "@/domain/errors";
import { resolveCompletedAt, withOverdue, type Task, type TaskView } from "@/domain/entities/task";
import type { Actor } from "../../actor";
import type { AppDeps } from "../../deps";
import { placeAtEnd } from "../../placement";
import { loadStage } from "../../resources";
import { parseInput } from "../../schemas/parse";
import { createTaskSchema } from "../../schemas/task";
import { assertAssigneeIsMember } from "./_assignee";

/**
 * Authorizes on a snapshot, then re-reads the stage inside the transaction and derives everything
 * that depends on it (board, pipeline, completion) from that row; the assignee is checked in the
 * same transaction so a concurrent member removal or done-flag change cannot slip through.
 * Lock order: stage, then its tasks.
 */
export function makeCreateTask(deps: AppDeps) {
  return async (actor: Actor, input: unknown): Promise<TaskView> => {
    const data = parseInput(createTaskSchema, input);
    await loadStage(deps.repos, actor, data.stageId, "task:write");
    const now = deps.clock.now();
    const task = await deps.uow.run(async (tx) => {
      const stage = await tx.stages.findById(data.stageId);
      if (!stage) throw new NotFoundError();
      await assertAssigneeIsMember(tx.members, stage.boardId, data.assigneeId);
      const placement = placeAtEnd(await tx.tasks.listByStage(stage.id));
      for (const relocated of placement.relocated) await tx.tasks.update(relocated);
      const created: Task = {
        ...data,
        id: deps.ids.next(),
        boardId: stage.boardId,
        pipelineId: stage.pipelineId,
        status: "active",
        completedAt: resolveCompletedAt(null, stage.isDone, now),
        position: placement.position,
        createdAt: now,
      };
      await tx.tasks.insert(created);
      return created;
    });
    return withOverdue(task, now);
  };
}
