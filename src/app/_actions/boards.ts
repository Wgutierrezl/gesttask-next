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
