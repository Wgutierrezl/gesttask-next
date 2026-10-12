"use client";

import { useTranslations } from "next-intl";
import { updateTaskAction } from "@/app/_actions/tasks";
import { MutationForm } from "@/components/ui/mutation-form";
import { FormFooter } from "@/components/ui/form-footer";
import { TASK_FIELD_NAMES, TaskFields } from "./task-fields";
import type { MemberOption, PriorityName } from "./types";

interface EditTaskFormProps {
  task: { id: string; title: string; description: string; priority: PriorityName; dueDate: string | null; assigneeId: string | null };
  members: MemberOption[];
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function EditTaskForm({ task, members, onSuccess, onCancel }: EditTaskFormProps) {
  const t = useTranslations("task");
  // A former member is not an option any more, so the select falls back to Unassigned rather than showing a stranger.
  const assigneeId = members.some((member) => member.userId === task.assigneeId) ? task.assigneeId : null;
  return (
    <MutationForm action={updateTaskAction} hidden={{ taskId: task.id }} inlineFields={TASK_FIELD_NAMES} onSuccess={onSuccess} className="flex flex-col gap-4">
      {(failure) => (
        <>
          <TaskFields prefix={`edit-${task.id}`} members={members} failure={failure} defaults={{ ...task, assigneeId }} />
          <FormFooter submitLabel={t("save")} pendingLabel={t("saving")} onCancel={onCancel} />
        </>
      )}
    </MutationForm>
  );
}
