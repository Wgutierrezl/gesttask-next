"use client";

import { deleteTaskAction } from "@/app/_actions/tasks";
import { MutationForm } from "@/components/ui/mutation-form";
import { SubmitButton } from "@/components/ui/submit-button";

/** A required checkbox, so confirming also works without JavaScript. */
export function DeleteTaskForm({ taskId }: { taskId: string }) {
  return (
    <MutationForm action={deleteTaskAction} hidden={{ taskId }} inlineFields={["confirm"]} className="flex flex-col gap-2">
      {(failure) => {
        const error = failure?.fieldErrors?.confirm;
        return (
          <>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="confirm" value="yes" required aria-invalid={error ? true : undefined} aria-describedby={error ? "delete-task-error" : undefined} className="mt-0.5" />
              <span>I want to delete this task</span>
            </label>
            {error ? <p id="delete-task-error" role="alert" className="text-sm text-red-700">{error.join(" ")}</p> : null}
            <div>
              <SubmitButton variant="danger" pendingLabel="Deleting...">Delete task</SubmitButton>
            </div>
          </>
        );
      }}
    </MutationForm>
  );
}
