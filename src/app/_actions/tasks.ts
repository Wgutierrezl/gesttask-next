"use server";

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

/** Deleting asks for confirmation; where to land afterwards comes from the deleted task, never from the form. */
export async function deleteTaskAction(_previous: MutationState, form: FormData): Promise<MutationState> {
  if (!checked(form, "confirm")) {
    return { ok: false, code: "VALIDATION", message: "Confirmation required", fieldErrors: { confirm: ["Confirm that you want to delete this task"] } };
  }
  return runMutation(() => getContainer().useCases.deleteTask({ taskId: text(form, "taskId") }), {
    ...pages,
    cleanupStorage: true,
    redirectTo: ({ boardId, pipelineId }) => pipelinePath(boardId, pipelineId),
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
 * The form that works without drag and drop or JavaScript: the task goes to the end of the chosen stage. The end is
 * resolved by the use case inside its transaction, so concurrent inserts and long columns cannot make it stale.
 */
export async function moveTaskToEndAction(_previous: MutationState, form: FormData): Promise<MutationState> {
  return runMutation(() => getContainer().useCases.moveTask({ taskId: text(form, "taskId"), toStageId: text(form, "toStageId"), toEnd: true }), pages);
}
