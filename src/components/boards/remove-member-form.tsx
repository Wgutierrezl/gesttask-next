"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { removeMemberAction } from "@/app/_actions/members";
import { failureOf } from "@/app/_shared/mutation-state";
import { FormError } from "@/components/auth/form-error";
import { SubmitButton } from "@/components/ui/submit-button";

interface RemoveMemberFormProps {
  boardId: string;
  userId: string;
  name: string;
  /** Removing oneself ends the owner's access, so the confirmation says so. */
  isSelf?: boolean;
}

/** Removal needs an explicit confirmation (a required checkbox, so it also works without JavaScript). */
export function RemoveMemberForm({ boardId, userId, name, isSelf }: RemoveMemberFormProps) {
  const t = useTranslations("board.member");
  const [state, formAction] = useActionState(removeMemberAction, undefined);
  const failure = failureOf(state);
  const confirmError = failure?.fieldErrors?.confirm;
  const errorId = `confirm-error-${userId}`;
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="boardId" value={boardId} />
      <input type="hidden" name="userId" value={userId} />
      <label className="flex items-start gap-2 text-xs">
        <input
          type="checkbox"
          name="confirm"
          value="yes"
          required
          aria-invalid={confirmError ? true : undefined}
          aria-describedby={confirmError ? errorId : undefined}
          className="mt-0.5"
        />
        <span>{isSelf ? t("loseAccessSelf") : t("loseAccess", { name })}</span>
      </label>
      {confirmError ? (
        <p id={errorId} role="alert" className="text-xs text-danger-fg">
          {confirmError.join(" ")}
        </p>
      ) : null}
      <FormError failure={failure} inlineFields={["confirm"]} />
      <div>
        <SubmitButton variant="danger" pendingLabel={t("removing")} ariaLabel={t("removeAria", { name })}>
          {t("remove")}
        </SubmitButton>
      </div>
    </form>
  );
}
