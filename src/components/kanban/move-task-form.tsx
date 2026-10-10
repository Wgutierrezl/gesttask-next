"use client";

import { moveTaskToEndAction } from "@/app/_actions/tasks";
import { MutationForm } from "@/components/ui/mutation-form";
import { SubmitButton } from "@/components/ui/submit-button";

interface MoveTaskFormProps {
  taskId: string;
  stages: { id: string; name: string }[];
  currentStageId: string;
}

/** Moves the task to the end of a stage. Works without drag and drop and without JavaScript. */
export function MoveTaskForm({ taskId, stages, currentStageId }: MoveTaskFormProps) {
  return (
    <MutationForm action={moveTaskToEndAction} hidden={{ taskId }} className="flex flex-wrap items-end gap-3">
      {() => (
        <>
          <div className="flex flex-col gap-1">
            <label htmlFor="move-task-stage" className="text-sm font-medium">Move to stage</label>
            <select id="move-task-stage" name="toStageId" defaultValue={currentStageId} className="rounded border border-gray-300 px-3 py-2 text-sm">
              {stages.map((stage) => (
                <option key={stage.id} value={stage.id}>{stage.name}</option>
              ))}
            </select>
          </div>
          <SubmitButton variant="secondary" pendingLabel="Moving...">Move task</SubmitButton>
        </>
      )}
    </MutationForm>
  );
}
