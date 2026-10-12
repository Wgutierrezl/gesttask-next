"use client";

import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { deleteStageAction } from "@/app/_actions/stages";
import { Dialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/field";
import { FormFooter } from "@/components/ui/form-footer";
import { MutationForm } from "@/components/ui/mutation-form";
import type { StageManagement } from "./stage-management";
import type { StageView } from "./types";

interface DeleteStageDialogProps {
  stage: StageView;
  manage: StageManagement;
  /** Tasks the column shows; with `mayHaveHiddenTasks` an empty-looking stage still needs a destination. */
  count: number;
  open: boolean;
  onClose: () => void;
}

/** Confirms the deletion. A stage with tasks (or possibly with some, when not all were loaded) must say where they go (REQ-PIP-02). */
export function DeleteStageDialog({ stage, manage, count, open, onClose }: DeleteStageDialogProps) {
  const t = useTranslations("stages.delete");
  const hasTasks = count > 0 || manage.mayHaveHiddenTasks;
  return (
    <Dialog title={t("title", { name: stage.name })} icon={<Trash2 className="size-5" />} open={open} onClose={onClose}>
      <MutationForm action={deleteStageAction} hidden={{ stageId: stage.id }} onSuccess={onClose} className="flex flex-col gap-4">
        {() => (
          <>
            {hasTasks ? (
              <div className="flex flex-col gap-1">
                <label className="flex flex-col gap-1 text-sm font-medium text-fg-strong">
                  <span>{t("moveTo")}</span>
                  <Select name="moveToStageId" required defaultValue={manage.others[0]?.id}>
                    {manage.others.map((other) => (
                      <option key={other.id} value={other.id}>{other.name}</option>
                    ))}
                  </Select>
                </label>
                <p className="text-xs text-fg-muted">{t("withTasks")}</p>
              </div>
            ) : (
              <p className="text-sm text-fg-muted">{t("empty")}</p>
            )}
            <FormFooter submitLabel={t("confirm")} pendingLabel={t("deleting")} variant="danger" onCancel={onClose} />
          </>
        )}
      </MutationForm>
    </Dialog>
  );
}
