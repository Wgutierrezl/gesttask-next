"use server";

import type { MutationState } from "../_shared/mutation-state";
import { runMutation, text } from "../_shared/run-mutation";
import { getContainer } from "@/infrastructure/container";

/** Every action calls the container's guarded use cases: the actor comes from the session, never the form. */
export async function createBoardAction(_previous: MutationState, form: FormData): Promise<MutationState> {
  return runMutation(() => getContainer().useCases.createBoard({ name: text(form, "name"), description: text(form, "description") }), {
    revalidate: ["/boards"],
    redirectTo: (board) => `/boards/${board.id}`,
  });
}

const boardPaths = (boardId: string) => ["/boards", `/boards/${boardId}`, `/boards/${boardId}/settings`];

/**
 * Board actions read the board id from a hidden form field rather than `.bind`: bound actions hang on Next 16's
 * no-JavaScript form post. The id is untrusted either way; the use case checks membership and role.
 */
export async function updateBoardAction(_previous: MutationState, form: FormData): Promise<MutationState> {
  const boardId = text(form, "boardId");
  return runMutation(() => getContainer().useCases.updateBoard({ boardId, name: text(form, "name"), description: text(form, "description") }), {
    revalidate: boardPaths(boardId),
  });
}

/** Archive (`inactive`) or restore (`active`); any other value is rejected by the use case's schema. */
export async function setBoardStatusAction(_previous: MutationState, form: FormData): Promise<MutationState> {
  const boardId = text(form, "boardId");
  return runMutation(() => getContainer().useCases.updateBoard({ boardId, status: text(form, "status") }), { revalidate: boardPaths(boardId) });
}

export async function deleteBoardAction(_previous: MutationState, form: FormData): Promise<MutationState> {
  const boardId = text(form, "boardId");
  if (text(form, "confirm") !== "yes") {
    return { ok: false, code: "VALIDATION", message: "Confirmation required", fieldErrors: { confirm: ["Confirm that you want to delete this board"] } };
  }
  return runMutation(() => getContainer().useCases.deleteBoard({ boardId }), { revalidate: ["/boards"], redirectTo: () => "/boards" });
}
