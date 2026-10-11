"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { deleteBoardAction } from "@/app/_actions/boards";
import { failureOf } from "@/app/_shared/mutation-state";
import { FormError } from "@/components/auth/form-error";
import { SubmitButton } from "@/components/ui/submit-button";

export function DeleteBoardForm({ board }: { board: { id: string; name: string } }) {
  const t = useTranslations("board.remove");
  const [state, formAction] = useActionState(deleteBoardAction, undefined);
  const failure = failureOf(state);
  const confirmError = failure?.fieldErrors?.confirm;
  return (
    <form action={formAction} className="flex max-w-md flex-col gap-3">
      <input type="hidden" name="boardId" value={board.id} />
      <p className="text-sm text-slate-700">
        {t.rich("warning", { name: board.name, strong: (chunks) => <strong key="board-name">{chunks}</strong> })}
      </p>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="confirm"
          value="yes"
          required
          aria-invalid={confirmError ? true : undefined}
          aria-describedby={confirmError ? "confirm-error" : undefined}
          className="mt-0.5"
        />
        <span>{t("confirmText")}</span>
      </label>
      {confirmError ? (
        <p id="confirm-error" role="alert" className="text-sm text-danger-700">
          {confirmError.join(" ")}
        </p>
      ) : null}
      <FormError failure={failure} inlineFields={["confirm"]} />
      <div>
        <SubmitButton variant="danger" pendingLabel={t("deleting")}>
          {t("delete")}
        </SubmitButton>
      </div>
    </form>
  );
}
