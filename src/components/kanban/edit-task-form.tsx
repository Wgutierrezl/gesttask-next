"use client";

import { updateTaskAction } from "@/app/_actions/tasks";
import { MutationForm } from "@/components/ui/mutation-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { TASK_FIELD_NAMES, TaskFields } from "./task-fields";
import type { MemberOption, PriorityName } from "./types";

interface EditTaskFormProps {
  task: { id: string; title: string; description: string; priority: PriorityName; dueDate: string | null; assigneeId: string | null };
  members: MemberOption[];
}

export function EditTaskForm({ task, members }: EditTaskFormProps) {
  // A former member is not an option any more, so the select falls back to Unassigned rather than showing a stranger.
  const assigneeId = members.some((member) => member.userId === task.assigneeId) ? task.assigneeId : null;
  return (
    <MutationForm action={updateTaskAction} hidden={{ taskId: task.id }} inlineFields={TASK_FIELD_NAMES} className="flex max-w-md flex-col gap-3">
      {(failure) => (
        <>
          <TaskFields prefix={`edit-${task.id}`} members={members} failure={failure} defaults={{ ...task, assigneeId }} />
          <div>
            <SubmitButton pendingLabel="Saving...">Save task</SubmitButton>
          </div>
        </>
      )}
    </MutationForm>
  );
}
