"use client";

import { useTranslations } from "next-intl";
import { deleteStageAction, renameStageAction, reorderStageAction, setStageDoneAction } from "@/app/_actions/stages";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/field";
import { MutationForm } from "@/components/ui/mutation-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { StageNameFields } from "./stage-name-fields";

export interface ManagedStage {
  id: string;
  name: string;
  isDone: boolean;
  taskCount: number;
}

interface StageRowProps {
  stage: ManagedStage;
  /** The stage the moved one should come after to go one place left, or "" to go first; null when it cannot move left. */
  afterWhenLeft: string | null;
  afterWhenRight: string | null;
  others: ManagedStage[];
  /** Some tasks were not loaded, so a stage that looks empty may not be. */
  mayHaveHiddenTasks: boolean;
}

function Move({ stage, direction, after }: { stage: ManagedStage; direction: "left" | "right"; after: string }) {
  const t = useTranslations("stages");
  return (
    <MutationForm action={reorderStageAction} hidden={{ stageId: stage.id, afterStageId: after }}>
      {() => (
        <SubmitButton variant="secondary" ariaLabel={direction === "left" ? t("moveLeft", { name: stage.name }) : t("moveRight", { name: stage.name })}>
          {direction === "left" ? t("left") : t("right")}
        </SubmitButton>
      )}
    </MutationForm>
  );
}

/** Everything the owner can do to one stage; each action is its own form so it also works without JavaScript. */
export function StageRow({ stage, afterWhenLeft, afterWhenRight, others, mayHaveHiddenTasks }: StageRowProps) {
  const t = useTranslations("stages");
  const tk = useTranslations("kanban");
  const hasTasks = stage.taskCount > 0 || mayHaveHiddenTasks;
  return (
    <li className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4 shadow-card">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-fg">{stage.name}</span>
        {stage.isDone ? <Badge tone="success">{tk("doneStage")}</Badge> : null}
        {afterWhenLeft !== null ? <Move stage={stage} direction="left" after={afterWhenLeft} /> : null}
        {afterWhenRight !== null ? <Move stage={stage} direction="right" after={afterWhenRight} /> : null}
      </div>
      <MutationForm action={renameStageAction} hidden={{ stageId: stage.id }} inlineFields={["name"]} className="flex flex-wrap items-end gap-2">
        {(failure) => (
          <>
            <StageNameFields idPrefix={`rename-${stage.id}`} label={t("rename", { name: stage.name })} defaultName={stage.name} offerDone={false} errors={failure?.fieldErrors?.name} />
            <SubmitButton variant="secondary" ariaLabel={t("saveAria", { name: stage.name })}>{t("save")}</SubmitButton>
          </>
        )}
      </MutationForm>
      <MutationForm action={setStageDoneAction} hidden={{ stageId: stage.id, isDone: String(!stage.isDone) }}>
        {() => (
          <SubmitButton variant="secondary" ariaLabel={stage.isDone ? t("clearDoneAria", { name: stage.name }) : t("markDoneAria", { name: stage.name })}>
            {stage.isDone ? t("clearDone") : t("markDone")}
          </SubmitButton>
        )}
      </MutationForm>
      {stage.isDone ? (
        <p className="text-xs text-fg-muted">{t("cannotDelete")}</p>
      ) : (
        <MutationForm action={deleteStageAction} hidden={{ stageId: stage.id }} className="flex flex-wrap items-end gap-2">
          {() => (
            <>
              <label className="flex flex-col gap-1 text-xs text-fg-strong">
                <span>{t("moveTasksTo", { name: stage.name })}</span>
                <Select name="moveToStageId" required={hasTasks} defaultValue={hasTasks ? others[0]?.id : ""}>
                  {!hasTasks ? <option value="">{t("noTasksToMove")}</option> : null}
                  {others.map((other) => (
                    <option key={other.id} value={other.id}>{other.name}</option>
                  ))}
                </Select>
              </label>
              <SubmitButton variant="danger" pendingLabel={t("deleting")} ariaLabel={t("deleteAria", { name: stage.name })}>{t("delete")}</SubmitButton>
            </>
          )}
        </MutationForm>
      )}
    </li>
  );
}
