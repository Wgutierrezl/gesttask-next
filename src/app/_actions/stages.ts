"use server";

import type { MutationState } from "../_shared/mutation-state";
import { PIPELINE_PAGE } from "../_shared/paths";
import { checked, optionalText, runMutation, text } from "../_shared/run-mutation";
import { getContainer } from "@/infrastructure/container";

const refresh = { revalidate: [PIPELINE_PAGE] };

/** Ticking "mark as done" is the visitor's choice; a stage is never flagged just because of its name. */
export async function createStageAction(_previous: MutationState, form: FormData): Promise<MutationState> {
  return runMutation(async () => {
    const stage = await getContainer().useCases.createStage({ pipelineId: text(form, "pipelineId"), name: text(form, "name") });
    if (checked(form, "markDone")) await getContainer().useCases.setStageDone({ stageId: stage.id, isDone: true });
  }, refresh);
}

export async function renameStageAction(_previous: MutationState, form: FormData): Promise<MutationState> {
  return runMutation(async () => {
    const stage = await getContainer().useCases.renameStage({ stageId: text(form, "stageId"), name: text(form, "name") });
    if (checked(form, "markDone")) await getContainer().useCases.setStageDone({ stageId: stage.id, isDone: true });
  }, refresh);
}

/** `afterStageId` empty means "first". */
export async function reorderStageAction(_previous: MutationState, form: FormData): Promise<MutationState> {
  return runMutation(() => getContainer().useCases.reorderStage({ stageId: text(form, "stageId"), afterStageId: optionalText(form, "afterStageId") ?? null }), refresh);
}

export async function setStageDoneAction(_previous: MutationState, form: FormData): Promise<MutationState> {
  return runMutation(() => getContainer().useCases.setStageDone({ stageId: text(form, "stageId"), isDone: text(form, "isDone") === "true" }), refresh);
}

/** Tasks of the deleted stage go to `moveToStageId`; the done stage cannot be deleted (the use case says why). */
export async function deleteStageAction(_previous: MutationState, form: FormData): Promise<MutationState> {
  return runMutation(() => getContainer().useCases.deleteStage({ stageId: text(form, "stageId"), moveToStageId: optionalText(form, "moveToStageId") }), refresh);
}
