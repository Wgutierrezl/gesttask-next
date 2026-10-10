"use server";

import type { MutationState } from "../_shared/mutation-state";
import { runMutation, text } from "../_shared/run-mutation";
import { getContainer } from "@/infrastructure/container";

const memberPaths = (boardId: string) => [`/boards/${boardId}`, `/boards/${boardId}/settings`];

export async function addMemberAction(_previous: MutationState, form: FormData): Promise<MutationState> {
  const boardId = text(form, "boardId");
  return runMutation(() => getContainer().useCases.addMemberByEmail({ boardId, email: text(form, "email"), role: text(form, "role") }), {
    revalidate: memberPaths(boardId),
  });
}

/** Whether the form targets the signed-in user: used only to choose where to land afterwards, never to authorize. */
async function targetsSelf(userId: string): Promise<boolean> {
  return (await getContainer().session.getActor())?.userId === userId;
}

export async function changeMemberRoleAction(_previous: MutationState, form: FormData): Promise<MutationState> {
  const boardId = text(form, "boardId");
  const userId = text(form, "userId");
  const self = await targetsSelf(userId);
  return runMutation(() => getContainer().useCases.changeMemberRole({ boardId, userId, role: text(form, "role") }), {
    revalidate: memberPaths(boardId),
    // Settings are owner-only: someone who just changed their own role lands on the board page instead of a 404.
    redirectTo: self ? () => `/boards/${boardId}` : undefined,
  });
}

export async function removeMemberAction(_previous: MutationState, form: FormData): Promise<MutationState> {
  const boardId = text(form, "boardId");
  const userId = text(form, "userId");
  const self = await targetsSelf(userId);
  return runMutation(() => getContainer().useCases.removeMember({ boardId, userId }), {
    revalidate: [...memberPaths(boardId), "/boards"],
    redirectTo: self ? () => "/boards" : undefined,
  });
}
