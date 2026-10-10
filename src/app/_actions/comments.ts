"use server";

import type { MutationState } from "../_shared/mutation-state";
import { TASK_PAGE } from "../_shared/paths";
import { checked, runMutation, text, texts } from "../_shared/run-mutation";
import { getContainer } from "@/infrastructure/container";

const refresh = { revalidate: [TASK_PAGE] };

/**
 * `attachmentIds` are the uploads the browser already sent to the storage; the use case checks that they exist, are the
 * caller's and fit the limits before linking them. Without JavaScript the form simply carries none.
 */
export async function createCommentAction(_previous: MutationState, form: FormData): Promise<MutationState> {
  return runMutation(
    () => getContainer().useCases.createComment({ taskId: text(form, "taskId"), body: text(form, "body"), attachmentIds: texts(form, "attachmentIds") }),
    refresh,
  );
}

export async function editCommentAction(_previous: MutationState, form: FormData): Promise<MutationState> {
  return runMutation(() => getContainer().useCases.editComment({ commentId: text(form, "commentId"), body: text(form, "body") }), refresh);
}

/** Deleting asks for confirmation; the objects of its attachments are removed from the storage after the response. */
export async function deleteCommentAction(_previous: MutationState, form: FormData): Promise<MutationState> {
  if (!checked(form, "confirm")) {
    return { ok: false, code: "VALIDATION", message: "Confirmation required", fieldErrors: { confirm: ["Confirm that you want to delete this comment"] } };
  }
  return runMutation(() => getContainer().useCases.deleteComment({ commentId: text(form, "commentId") }), { ...refresh, cleanupStorage: true });
}
