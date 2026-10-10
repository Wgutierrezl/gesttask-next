import { NotFoundError } from "@/domain/errors";
import { resolveCompletedAt, withOverdue, type Task, type TaskView } from "@/domain/entities/task";
import type { Actor } from "../../actor";
import type { AppDeps } from "../../deps";
import { assertGuestTaskQuota } from "../../guest-quota";
import { placeAtEnd } from "../../placement";
import { loadStage } from "../../resources";
import { parseInput } from "../../schemas/parse";
import { createTaskSchema } from "../../schemas/task";
import { assertAssigneeIsMember } from "./_assignee";

/**
 * Authorizes on a snapshot, then re-reads the stage inside the transaction and derives everything
 * that depends on it (board, pipeline, completion) from that row; the assignee is checked in the
 * same transaction so a concurrent member removal or done-flag change cannot slip through.
 * Lock order (global, top-down): the assignee's membership, the pipeline and its stages (the stage is picked from that
 * list), then the stage's tasks. The insert takes a KEY SHARE lock on the pipeline and the stage for its foreign keys,
 * so holding the pipeline first keeps a pipeline, stage or board delete from slipping in between (no cycle).
 */
export function makeCreateTask(deps: AppDeps) {
  return async (actor: Actor, input: unknown): Promise<TaskView> => {
    const data = parseInput(createTaskSchema, input);
    const known = await loadStage(deps.repos, actor, data.stageId, "task:write");
    const now = deps.clock.now();
    const task = await deps.uow.run(async (tx) => {
      // The board and pipeline of a stage never change, so the snapshot says what to lock; the stage itself is re-read.
      await assertAssigneeIsMember(tx.members, known.boardId, data.assigneeId);
      const stage = (await tx.stages.listByPipeline(known.pipelineId)).find((s) => s.id === data.stageId);
      if (!stage) throw new NotFoundError();
      await assertGuestTaskQuota(tx, actor);
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
