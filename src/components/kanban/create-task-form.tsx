"use client";

import { createTaskAction } from "@/app/_actions/tasks";
import { Field, Select } from "@/components/ui/field";
import { MutationForm } from "@/components/ui/mutation-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { TASK_FIELD_NAMES, TaskFields } from "./task-fields";
import type { MemberOption } from "./types";

interface CreateTaskFormProps {
  stages: { id: string; name: string }[];
  members: MemberOption[];
}

/** Adds a task at the end of the chosen stage. Guest quota errors come back as a readable message. */
export function CreateTaskForm({ stages, members }: CreateTaskFormProps) {
  if (stages.length === 0) return <p className="text-sm text-slate-600">Add a stage first: tasks live inside stages.</p>;
  return (
    <MutationForm action={createTaskAction} inlineFields={TASK_FIELD_NAMES} className="flex max-w-md flex-col gap-3">
      {(failure) => (
        <>
          <Field label="Stage">
            <Select id="new-task-stage" name="stageId" defaultValue={stages[0]!.id}>
              {stages.map((stage) => (
                <option key={stage.id} value={stage.id}>{stage.name}</option>
              ))}
            </Select>
          </Field>
          <TaskFields prefix="new-task" members={members} failure={failure} />
          <div>
            <SubmitButton pendingLabel="Adding...">Add task</SubmitButton>
          </div>
        </>
      )}
    </MutationForm>
  );
}
