"use client";

import { moveTaskFromDetailAction } from "@/app/_actions/tasks";
import { Field, Select } from "@/components/ui/field";
import { MutationForm } from "@/components/ui/mutation-form";
import { SubmitButton } from "@/components/ui/submit-button";

interface MoveTaskFormProps {
  taskId: string;
  /** The pipeline the task page is on: moving elsewhere takes the visitor to the task's new page. */
  pipelineId: string;
  pipelineName: string;
  stages: { id: string; name: string }[];
  currentStageId: string;
  /** The board's other pipelines, offered as groups of stages. Plain `optgroup`s, so it works without JavaScript. */
  otherPipelines?: { id: string; name: string; stages: { id: string; name: string }[] }[];
  /** Set when the form is inside the task modal, so moving to another pipeline lands on that pipeline's board. */
  inModal?: boolean;
}

/** Moves the task to the end of a stage, in this pipeline or another one of the board. Works without drag and drop and without JavaScript. */
export function MoveTaskForm({ taskId, pipelineId, pipelineName, stages, currentStageId, otherPipelines = [], inModal = false }: MoveTaskFormProps) {
  const options = (list: { id: string; name: string }[]) => list.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>);
  const elsewhere = otherPipelines.filter((pipeline) => pipeline.stages.length > 0);
  return (
    <MutationForm action={moveTaskFromDetailAction} hidden={inModal ? { taskId, pipelineId, surface: "modal" } : { taskId, pipelineId }} className="flex flex-wrap items-end gap-3">
      {() => (
        <>
          <div className="min-w-0 flex-1">
            <Field label="Move to stage">
              <Select id="move-task-stage" name="toStageId" defaultValue={currentStageId}>
                {elsewhere.length === 0 ? (
                  options(stages)
                ) : (
                  <>
                    <optgroup label={pipelineName}>{options(stages)}</optgroup>
                    {elsewhere.map((pipeline) => (
                      <optgroup key={pipeline.id} label={pipeline.name}>{options(pipeline.stages)}</optgroup>
                    ))}
                  </>
                )}
              </Select>
            </Field>
          </div>
          <SubmitButton variant="secondary" pendingLabel="Moving...">Move task</SubmitButton>
        </>
      )}
    </MutationForm>
  );
}
