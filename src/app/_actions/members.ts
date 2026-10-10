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

/** The signed-in user's id; resolved inside the mutation so a failing lookup is reported as state, never thrown raw. */
async function currentUserId(): Promise<string | undefined> {
  return (await getContainer().session.getActor())?.userId;
}

export async function changeMemberRoleAction(_previous: MutationState, form: FormData): Promise<MutationState> {
  const boardId = text(form, "boardId");
  const userId = text(form, "userId");
  return runMutation(
    async () => {
      const self = (await currentUserId()) === userId;
      const member = await getContainer().useCases.changeMemberRole({ boardId, userId, role: text(form, "role") });
      return { self, role: member.role };
    },
    {
      revalidate: memberPaths(boardId),
      // Settings are owner-only: someone who just stopped being an owner lands on the board page instead of a 404.
      redirectTo: ({ self, role }) => (self && role !== "owner" ? `/boards/${boardId}` : null),
    },
  );
}

export async function removeMemberAction(_previous: MutationState, form: FormData): Promise<MutationState> {
  const boardId = text(form, "boardId");
  const userId = text(form, "userId");
  if (text(form, "confirm") !== "yes") {
    return { ok: false, code: "VALIDATION", message: "Confirmation required", fieldErrors: { confirm: ["Confirm that you want to remove this member"] } };
  }
  return runMutation(
    async () => {
      const self = (await currentUserId()) === userId;
      await getContainer().useCases.removeMember({ boardId, userId });
      return { self };
    },
    {
      revalidate: [...memberPaths(boardId), "/boards"],
      // Leaving the board: its pages are gone for this user.
      redirectTo: ({ self }) => (self ? "/boards" : null),
    },
  );
}
