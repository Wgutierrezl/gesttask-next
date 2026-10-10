"use client";

import { useActionState } from "react";
import { setBoardStatusAction } from "@/app/_actions/boards";
import { failureOf } from "@/app/_shared/mutation-state";
import { FormError } from "@/components/auth/form-error";
import { SubmitButton } from "@/components/ui/submit-button";

/** Archiving hides nothing from members and loses no data; it marks the board as no longer active. */
export function ArchiveBoardForm({ board }: { board: { id: string; status: "active" | "inactive" } }) {
  const [state, formAction] = useActionState(setBoardStatusAction, undefined);
  const archived = board.status === "inactive";
  return (
    <form action={formAction} className="flex max-w-md flex-col gap-3">
      <input type="hidden" name="boardId" value={board.id} />
      <input type="hidden" name="status" value={archived ? "active" : "inactive"} />
      <p className="text-sm text-gray-600">
        {archived ? "This board is archived. Restore it to mark it as active again." : "Archive the board when the work is finished. Nothing is deleted."}
      </p>
      <FormError failure={failureOf(state)} />
      <div>
        <SubmitButton variant="secondary" pendingLabel="Updating...">
          {archived ? "Restore board" : "Archive board"}
        </SubmitButton>
      </div>
    </form>
  );
}
