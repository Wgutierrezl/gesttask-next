"use client";

import { useTranslations } from "next-intl";
import { createTaskAction } from "@/app/_actions/tasks";
import { Field, Select } from "@/components/ui/field";
import { MutationForm } from "@/components/ui/mutation-form";
import { FormFooter } from "@/components/ui/form-footer";
import { TASK_FIELD_NAMES, TaskFields } from "./task-fields";
import type { MemberOption } from "./types";

interface CreateTaskFormProps {
  stages: { id: string; name: string }[];
  members: MemberOption[];
  /** The stage the select starts on; the first one when absent. */
  defaultStageId?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

/** Adds a task at the end of the chosen stage. Guest quota errors come back as a readable message. */
export function CreateTaskForm({ stages, members, defaultStageId, onSuccess, onCancel }: CreateTaskFormProps) {
  const t = useTranslations("kanban");
  if (stages.length === 0) return <p className="text-sm text-fg-muted">{t("addStageFirst")}</p>;
  return (
    <MutationForm action={createTaskAction} inlineFields={TASK_FIELD_NAMES} onSuccess={onSuccess} className="flex flex-col gap-4">
      {(failure) => (
        <>
          <Field label={t("fields.stage")}>
            <Select id="new-task-stage" name="stageId" defaultValue={stages.some((stage) => stage.id === defaultStageId) ? defaultStageId : stages[0]!.id}>
              {stages.map((stage) => (
                <option key={stage.id} value={stage.id}>{stage.name}</option>
              ))}
            </Select>
          </Field>
          <TaskFields prefix="new-task" members={members} failure={failure} />
          <FormFooter submitLabel={t("addTask")} pendingLabel={t("adding")} onCancel={onCancel} />
        </>
      )}
    </MutationForm>
  );
}
