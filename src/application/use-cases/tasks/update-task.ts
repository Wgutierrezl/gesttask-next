import { withOverdue, type Task, type TaskView } from "@/domain/entities/task";
import type { Actor } from "../../actor";
import type { AppDeps } from "../../deps";
import { loadTask } from "../../resources";
import { parseInput } from "../../schemas/parse";
import { updateTaskSchema } from "../../schemas/task";
import { assertAssigneeIsMember } from "./_assignee";

export function makeUpdateTask(deps: AppDeps) {
  return async (actor: Actor, input: unknown): Promise<TaskView> => {
    const { taskId, ...changes } = parseInput(updateTaskSchema, input);
    const current = await loadTask(deps.repos, actor, taskId, "task:write");
    if (changes.assigneeId !== undefined) {
      await assertAssigneeIsMember(deps.repos.members, current.boardId, changes.assigneeId);
    }
    const updated: Task = {
      ...current,
      title: changes.title ?? current.title,
      description: changes.description ?? current.description,
      priority: changes.priority ?? current.priority,
      status: changes.status ?? current.status,
      dueDate: changes.dueDate === undefined ? current.dueDate : changes.dueDate,
      assigneeId: changes.assigneeId === undefined ? current.assigneeId : changes.assigneeId,
    };
    await deps.repos.tasks.update(updated);
    return withOverdue(updated, deps.clock.now());
  };
}
