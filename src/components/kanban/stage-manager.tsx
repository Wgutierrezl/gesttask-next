import { CreateStageForm } from "./create-stage-form";
import { StageRow, type ManagedStage } from "./stage-row";

/**
 * Owner-only panel: add, rename, reorder, flag as done, delete. Works on the ordered stage list the page already loaded.
 * `truncated` means not every task is shown, so task counts are lower bounds and no stage is assumed empty.
 */
export function StageManager({ pipelineId, stages, truncated = false }: { pipelineId: string; stages: ManagedStage[]; truncated?: boolean }) {
  return (
    <details className="rounded border border-gray-200 p-3">
      <summary className="cursor-pointer text-sm font-medium">Manage stages</summary>
      <div className="mt-3 flex flex-col gap-4">
        <ul aria-label="Stages" className="flex flex-col gap-2">
          {stages.map((stage, i) => (
            <StageRow
              key={stage.id}
              stage={stage}
              afterWhenLeft={i === 0 ? null : (stages[i - 2]?.id ?? "")}
              afterWhenRight={i === stages.length - 1 ? null : stages[i + 1]!.id}
              others={stages.filter((other) => other.id !== stage.id)}
              mayHaveHiddenTasks={truncated}
            />
          ))}
        </ul>
        <section aria-labelledby="add-stage-heading">
          <h3 id="add-stage-heading" className="mb-2 text-sm font-medium">Add a stage</h3>
          <CreateStageForm pipelineId={pipelineId} />
        </section>
      </div>
    </details>
  );
}
