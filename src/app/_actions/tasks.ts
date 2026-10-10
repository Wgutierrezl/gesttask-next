"use server";

import { loadTasks } from "../_shared/kanban-data";
import type { MutationState } from "../_shared/mutation-state";
import { PIPELINE_PAGE, TASK_PAGE, pipelinePath } from "../_shared/paths";
import { checked, optionalText, runMutation, text } from "../_shared/run-mutation";
import { getContainer } from "@/infrastructure/container";

const pages = { revalidate: [PIPELINE_PAGE, TASK_PAGE] };

export async function createTaskAction(_previous: MutationState, form: FormData): Promise<MutationState> {
  return runMutation(
    () =>
      getContainer().useCases.createTask({
        stageId: text(form, "stageId"),
        title: text(form, "title"),
        description: text(form, "description"),
        priority: optionalText(form, "priority"),
        dueDate: optionalText(form, "dueDate") ?? null,
        assigneeId: optionalText(form, "assigneeId") ?? null,
      }),
    { revalidate: [PIPELINE_PAGE] },
  );
}

/** The edit form always sends every field, so an emptied due date or assignee clears it. */
export async function updateTaskAction(_previous: MutationState, form: FormData): Promise<MutationState> {
  return runMutation(
    () =>
      getContainer().useCases.updateTask({
        taskId: text(form, "taskId"),
        title: text(form, "title"),
        description: text(form, "description"),
        priority: optionalText(form, "priority"),
        dueDate: optionalText(form, "dueDate") ?? null,
        assigneeId: optionalText(form, "assigneeId") ?? null,
      }),
    pages,
  );
}

/** Deleting asks for confirmation; the ids in the hidden fields only decide where to land afterwards. */
export async function deleteTaskAction(_previous: MutationState, form: FormData): Promise<MutationState> {
  if (!checked(form, "confirm")) {
    return { ok: false, code: "VALIDATION", message: "Confirmation required", fieldErrors: { confirm: ["Confirm that you want to delete this task"] } };
  }
  return runMutation(() => getContainer().useCases.deleteTask({ taskId: text(form, "taskId") }), {
    ...pages,
    redirectTo: () => pipelinePath(text(form, "boardId"), text(form, "pipelineId")),
  });
}

/** `afterTaskId` empty means "top of the stage". Moving inside the current stage is a plain reorder in the use case. */
export async function moveTaskAction(_previous: MutationState, form: FormData): Promise<MutationState> {
  return runMutation(
    () => getContainer().useCases.moveTask({ taskId: text(form, "taskId"), toStageId: text(form, "toStageId"), afterTaskId: optionalText(form, "afterTaskId") ?? null }),
    pages,
  );
}

export async function reorderTaskAction(_previous: MutationState, form: FormData): Promise<MutationState> {
  return runMutation(() => getContainer().useCases.reorderTask({ taskId: text(form, "taskId"), afterTaskId: optionalText(form, "afterTaskId") ?? null }), pages);
}

/**
 * The form that works without drag and drop or JavaScript: the task goes to the end of the chosen stage. The
 * anchor is read through the guarded use cases (the task lookup authorizes first), then the same move runs.
 */
export async function moveTaskToEndAction(_previous: MutationState, form: FormData): Promise<MutationState> {
  const taskId = text(form, "taskId");
  const toStageId = text(form, "toStageId");
  return runMutation(async () => {
    const { pipelineId } = await getContainer().useCases.getTask({ taskId });
    const { tasks } = await loadTasks((page) => getContainer().useCases.listTasksByPipeline({ pipelineId, ...page }));
    const last = tasks.filter((task) => task.stageId === toStageId && task.id !== taskId).at(-1);
    await getContainer().useCases.moveTask({ taskId, toStageId, afterTaskId: last?.id ?? null });
  }, pages);
}
