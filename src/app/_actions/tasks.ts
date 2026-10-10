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
