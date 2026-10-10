"use server";

import type { MutationState } from "../_shared/mutation-state";
import { runMutation, text } from "../_shared/run-mutation";
import { getContainer } from "@/infrastructure/container";

/** The board id comes from a hidden field (see boards.ts); the use case still checks membership and role. */
export async function createPipelineAction(_previous: MutationState, form: FormData): Promise<MutationState> {
  const boardId = text(form, "boardId");
  return runMutation(() => getContainer().useCases.createPipeline({ boardId, name: text(form, "name"), description: text(form, "description") }), {
    revalidate: [`/boards/${boardId}`],
  });
}
