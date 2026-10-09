import { NotFoundError } from "@/domain/errors";
import { withOverdue, type Task, type TaskView } from "@/domain/entities/task";
import type { Actor } from "../../actor";
import type { AppDeps } from "../../deps";
import { loadTask } from "../../resources";
import { parseInput } from "../../schemas/parse";
import { updateTaskSchema } from "../../schemas/task";
import { assertAssigneeIsMember } from "./_assignee";

/** Authorizes on a snapshot, then re-reads the task inside the transaction so no concurrent write is lost. */
export function makeUpdateTask(deps: AppDeps) {
  return async (actor: Actor, input: unknown): Promise<TaskView> => {
    const { taskId, ...changes } = parseInput(updateTaskSchema, input);
    await loadTask(deps.repos, actor, taskId, "task:write");
    const updated = await deps.uow.run(async (tx) => {
      const current = await tx.tasks.findById(taskId);
      if (!current) throw new NotFoundError();
      if (changes.assigneeId !== undefined) {
        await assertAssigneeIsMember(tx.members, current.boardId, changes.assigneeId);
      }
      const next: Task = {
        ...current,
        title: changes.title ?? current.title,
        description: changes.description ?? current.description,
        priority: changes.priority ?? current.priority,
        status: changes.status ?? current.status,
        dueDate: changes.dueDate === undefined ? current.dueDate : changes.dueDate,
        assigneeId: changes.assigneeId === undefined ? current.assigneeId : changes.assigneeId,
      };
      await tx.tasks.update(next);
      return next;
    });
    return withOverdue(updated, deps.clock.now());
  };
}
