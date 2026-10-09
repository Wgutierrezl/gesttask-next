import { resolveCompletedAt, withOverdue, type Task, type TaskView } from "@/domain/entities/task";
import type { Actor } from "../../actor";
import type { AppDeps } from "../../deps";
import { positionAtEnd } from "../../placement";
import { loadStage } from "../../resources";
import { parseInput } from "../../schemas/parse";
import { createTaskSchema } from "../../schemas/task";
import { assertAssigneeIsMember } from "./_assignee";

export function makeCreateTask(deps: AppDeps) {
  return async (actor: Actor, input: unknown): Promise<TaskView> => {
    const data = parseInput(createTaskSchema, input);
    const stage = await loadStage(deps.repos, actor, data.stageId, "task:write");
    await assertAssigneeIsMember(deps.repos.members, stage.boardId, data.assigneeId);
    const now = deps.clock.now();
    const task = await deps.uow.run(async (tx) => {
      const siblings = await tx.tasks.listByStage(stage.id);
      const created: Task = {
        ...data,
        id: deps.ids.next(),
        boardId: stage.boardId,
        pipelineId: stage.pipelineId,
        status: "active",
        completedAt: resolveCompletedAt(null, stage.isDone, now),
        position: positionAtEnd(siblings),
        createdAt: now,
      };
      await tx.tasks.insert(created);
      return created;
    });
    return withOverdue(task, now);
  };
}
