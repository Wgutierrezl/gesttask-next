"use client";

import { Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useFormStatus } from "react-dom";
import { createStageAction } from "@/app/_actions/stages";
import { MutationForm } from "@/components/ui/mutation-form";

function AddButton() {
  const t = useTranslations("stages.add");
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="rounded-control bg-brand-gradient px-3 py-1.5 text-sm font-medium text-white shadow-brand transition hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60">
      {pending ? t("adding") : t("save")}
    </button>
  );
}

/** The ghost column at the end of the board: a dashed "Add stage" that opens an inline input and creates the stage at the end. */
export function AddStageColumn({ pipelineId }: { pipelineId: string }) {
  const t = useTranslations("stages.add");
  const [adding, setAdding] = useState(false);
  // Controlled so a refusal keeps the typed name; closing (cancel or success) empties it for the next time.
  const [value, setValue] = useState("");
  const opener = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const wasAdding = useRef(false);
  useEffect(() => {
    if (adding) input.current?.focus();
    else if (wasAdding.current) opener.current?.focus();
    wasAdding.current = adding;
  }, [adding]);
  const close = () => {
    setValue("");
    setAdding(false);
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    close();
  };
  return (
    <div className="flex min-h-40 w-80 shrink-0 snap-start flex-col rounded-card border-2 border-dashed border-border-strong p-3">
      {adding ? (
        <MutationForm action={createStageAction} hidden={{ pipelineId }} inlineFields={["name"]} onSuccess={() => close()} onKeyDown={onKeyDown} className="flex flex-col gap-2">
          {(failure) => (
            <>
              <input
                ref={input}
                name="name"
                aria-label={t("name")}
                aria-invalid={failure?.fieldErrors?.name ? true : undefined}
                required
                maxLength={60}
                value={value}
                onChange={(event) => setValue(event.target.value)}
                className="w-full rounded-control border border-border-control bg-surface px-3 py-2 text-sm text-fg focus-visible:outline-2 focus-visible:outline-ring aria-invalid:border-danger-600"
              />
              {failure?.fieldErrors?.name ? <p className="text-xs text-danger-fg">{failure.fieldErrors.name.join(" ")}</p> : null}
              <div className="flex items-center gap-2">
                <AddButton />
                <button type="button" aria-label={t("cancel")} onClick={close} className="rounded-lg p-1.5 text-fg-subtle transition-colors hover:bg-surface hover:text-fg-strong focus-visible:outline-2 focus-visible:outline-ring">
                  <X aria-hidden="true" className="size-4" />
                </button>
              </div>
            </>
          )}
        </MutationForm>
      ) : (
        <button ref={opener} data-add-stage type="button" onClick={() => setAdding(true)} className="flex w-full items-center justify-center gap-2 rounded-control px-4 py-2.5 text-sm text-fg-muted transition-colors hover:bg-brand-soft hover:text-brand-link focus-visible:outline-2 focus-visible:outline-ring">
          <Plus aria-hidden="true" className="size-4" />
          {t("open")}
        </button>
      )}
    </div>
  );
}
