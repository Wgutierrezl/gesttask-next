"use client";

import { deleteStageAction, renameStageAction, reorderStageAction, setStageDoneAction } from "@/app/_actions/stages";
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
}

function Move({ stage, direction, after }: { stage: ManagedStage; direction: "left" | "right"; after: string }) {
  return (
    <MutationForm action={reorderStageAction} hidden={{ stageId: stage.id, afterStageId: after }}>
      {() => (
        <SubmitButton variant="secondary" ariaLabel={`Move ${stage.name} ${direction}`}>
          {direction === "left" ? "Left" : "Right"}
        </SubmitButton>
      )}
    </MutationForm>
  );
}

/** Everything the owner can do to one stage; each action is its own form so it also works without JavaScript. */
export function StageRow({ stage, afterWhenLeft, afterWhenRight, others }: StageRowProps) {
  return (
    <li className="flex flex-col gap-3 rounded border border-gray-200 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{stage.name}</span>
        {stage.isDone ? <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-900">Done stage</span> : null}
        {afterWhenLeft !== null ? <Move stage={stage} direction="left" after={afterWhenLeft} /> : null}
        {afterWhenRight !== null ? <Move stage={stage} direction="right" after={afterWhenRight} /> : null}
      </div>
      <MutationForm action={renameStageAction} hidden={{ stageId: stage.id }} inlineFields={["name"]} className="flex flex-wrap items-end gap-2">
        {(failure) => (
          <>
            <StageNameFields idPrefix={`rename-${stage.id}`} label={`Rename ${stage.name}`} defaultName={stage.name} offerDone={false} errors={failure?.fieldErrors?.name} />
            <SubmitButton variant="secondary" ariaLabel={`Save name of ${stage.name}`}>Save</SubmitButton>
          </>
        )}
      </MutationForm>
      <MutationForm action={setStageDoneAction} hidden={{ stageId: stage.id, isDone: String(!stage.isDone) }}>
        {() => (
          <SubmitButton variant="secondary" ariaLabel={stage.isDone ? `Clear done flag on ${stage.name}` : `Mark ${stage.name} as done stage`}>
            {stage.isDone ? "Clear done flag" : "Mark as done stage"}
          </SubmitButton>
        )}
      </MutationForm>
      {stage.isDone ? (
        <p className="text-xs text-gray-600">The done stage cannot be deleted. Mark another stage as done first.</p>
      ) : (
        <MutationForm action={deleteStageAction} hidden={{ stageId: stage.id }} className="flex flex-wrap items-end gap-2">
          {() => (
            <>
              <label className="flex flex-col gap-1 text-xs">
                <span>{`Move tasks of ${stage.name} to`}</span>
                <select name="moveToStageId" required={stage.taskCount > 0} defaultValue={stage.taskCount > 0 ? others[0]?.id : ""} className="rounded border border-gray-300 px-2 py-1 text-sm">
                  {stage.taskCount === 0 ? <option value="">No tasks to move</option> : null}
                  {others.map((other) => (
                    <option key={other.id} value={other.id}>{other.name}</option>
                  ))}
                </select>
              </label>
              <SubmitButton variant="danger" pendingLabel="Deleting..." ariaLabel={`Delete ${stage.name}`}>Delete</SubmitButton>
            </>
          )}
        </MutationForm>
      )}
    </li>
  );
}
