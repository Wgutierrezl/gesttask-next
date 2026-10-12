"use server";

import type { MutationState } from "../_shared/mutation-state";
import { runMutation, text, texts } from "../_shared/run-mutation";
import { getContainer } from "@/infrastructure/container";

/**
 * The board id comes from a hidden field (see boards.ts); the use case still checks membership and role.
 * Initial stages arrive as repeated `stages` fields, in row order; none posted means the default stages.
 */
export async function createPipelineAction(_previous: MutationState, form: FormData): Promise<MutationState> {
  const boardId = text(form, "boardId");
  const stages = texts(form, "stages");
  return runMutation(() => getContainer().useCases.createPipeline({ boardId, name: text(form, "name"), description: text(form, "description"), stages: stages.length > 0 ? stages : undefined }), {
    revalidate: [`/boards/${boardId}`],
  });
}
