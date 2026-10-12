"use client";

import { Check, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition, type KeyboardEvent } from "react";
import { useFormStatus } from "react-dom";
import { renameStageAction, reorderStageAction, setStageDoneAction } from "@/app/_actions/stages";
import { failureOf, type MutationState } from "@/app/_shared/mutation-state";
import { describeFailure } from "@/components/auth/form-error";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/components/ui/cn";
import { MutationForm } from "@/components/ui/mutation-form";
import { StageMenu } from "./stage-menu";
import type { StageManagement } from "./stage-management";
import type { StageView } from "./types";

type StageAction = (previous: MutationState, form: FormData) => Promise<MutationState>;

/** Runs one stage command from the menu as a function call, keeping the refusal to show under the header. */
function useStageCommand() {
  const tErrors = useTranslations("auth.errors");
  const t = useTranslations("stages.menu");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (action: StageAction, values: Record<string, string>) => {
    setError(null);
    start(async () => {
      const form = new FormData();
      for (const [name, value] of Object.entries(values)) form.set(name, value);
      try {
        const failure = failureOf(await action(undefined, form));
        if (failure) setError(describeFailure(failure, [], tErrors) || t("failed"));
      } catch {
        setError(t("failed"));
      }
    });
  };
  return { run, error, pending };
}

function IconSubmit({ label, children }: { label: string; children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" aria-label={label} disabled={pending} className="rounded-lg p-1.5 text-fg-strong transition-colors hover:bg-surface focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60">
      {children}
    </button>
  );
}

function RenameForm({ stage, onDone, onCancel }: { stage: StageView; onDone: () => void; onCancel: () => void }) {
  const t = useTranslations("stages.rename");
  const input = useRef<HTMLInputElement>(null);
  // Controlled: a form action resets its fields after it ran, even when it refused, and the typed name must survive that.
  const [value, setValue] = useState(stage.name);
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);
  // On the form, so Escape also works with the focus on Save or Cancel.
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    onCancel();
  };
  return (
    <MutationForm action={renameStageAction} hidden={{ stageId: stage.id }} inlineFields={["name"]} onSuccess={onDone} onKeyDown={onKeyDown} className="flex min-w-0 flex-1 flex-wrap items-center gap-1 [&>[role=alert]]:basis-full">
      {(failure) => (
        <>
          <input
            ref={input}
            name="name"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            aria-label={t("label")}
            aria-invalid={failure?.fieldErrors?.name ? true : undefined}
            required
            maxLength={60}
            className="min-w-0 flex-1 rounded-lg border border-border-control bg-surface px-2 py-1 text-sm font-semibold text-fg focus-visible:outline-2 focus-visible:outline-ring aria-invalid:border-danger-600"
          />
          <IconSubmit label={t("save")}><Check aria-hidden="true" className="size-4" /></IconSubmit>
          <button type="button" aria-label={t("cancel")} onClick={onCancel} className="rounded-lg p-1.5 text-fg-subtle transition-colors hover:bg-surface hover:text-fg-strong focus-visible:outline-2 focus-visible:outline-ring">
            <X aria-hidden="true" className="size-4" />
          </button>
          {failure?.fieldErrors?.name ? <p className="basis-full text-xs text-danger-fg">{failure.fieldErrors.name.join(" ")}</p> : null}
        </>
      )}
    </MutationForm>
  );
}

/**
 * A column's header: colored dot, name and task count (the done stage is marked). Owners also get the "⋯" menu: rename in
 * place, move left or right, mark as the done stage, delete. Viewers and members get the plain header.
 */
export function StageHeader({ stage, count, manage }: { stage: StageView; count: number; manage?: StageManagement }) {
  const t = useTranslations("kanban");
  const [renaming, setRenaming] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const { run, error, pending } = useStageCommand();
  const refocus = useRef(false);
  /** After a command that moves or re-flags the stage: its menu button, wherever the column ended up, once the command is over. */
  const refocusAfterCommand = useRef(false);
  const command = (action: StageAction, values: Record<string, string>) => {
    refocusAfterCommand.current = true;
    run(action, values);
  };
  useEffect(() => {
    if (pending || !refocusAfterCommand.current) return;
    refocusAfterCommand.current = false;
    document.querySelector<HTMLElement>(`[data-stage-menu="${stage.id}"]`)?.focus({ preventScroll: true });
  }, [pending, stage.id]);
  const stopRenaming = () => {
    refocus.current = true;
    setRenaming(false);
  };
  // The input that held the focus is gone; the menu button is the natural place to continue from.
  useEffect(() => {
    if (renaming || !refocus.current) return;
    refocus.current = false;
    trigger.current?.focus();
  }, [renaming]);
  return (
    <header className="mb-4 flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", stage.isDone ? "bg-success-fg" : "bg-accent")} />
          {renaming ? <RenameForm stage={stage} onDone={stopRenaming} onCancel={stopRenaming} /> : <h3 className="min-w-0 truncate text-sm font-medium text-fg">{stage.name}</h3>}
        </div>
        <span className="flex shrink-0 items-center gap-1.5">
          {stage.isDone ? <Badge tone="success">{t("doneStage")}</Badge> : null}
          <span data-testid="column-count" className="inline-flex min-w-6 justify-center rounded-lg border border-border bg-surface px-2 py-0.5 text-xs text-fg-muted">{count}</span>
          {manage ? (
            <StageMenu
              stage={stage}
              count={count}
              manage={manage}
              busy={pending}
              triggerRef={trigger}
              onRename={() => setRenaming(true)}
              onMove={(afterStageId) => command(reorderStageAction, { stageId: stage.id, afterStageId })}
              onToggleDone={() => command(setStageDoneAction, { stageId: stage.id, isDone: String(!stage.isDone) })}
            />
          ) : null}
        </span>
      </div>
      {error ? <p role="alert" className="text-xs text-danger-fg">{error}</p> : null}
    </header>
  );
}
