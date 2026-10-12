import type { StageView } from "./types";

/** What one column's stage menu needs to know about its neighbours. */
export interface StageManagement {
  /** The stage the moved one should come after to go one place left, or "" to go first; null when it cannot move left. */
  afterWhenLeft: string | null;
  afterWhenRight: string | null;
  /** Where the tasks of a deleted stage can go: every other stage, in column order. */
  others: { id: string; name: string }[];
  /** The stage after this one, whose menu button takes the focus once this one is deleted; null: the Add stage button does. */
  nextStageId: string | null;
  /** Called when the deletion is submitted, before its outcome is known; the board moves the focus once the stage is gone. */
  onDeleting?: (stageId: string, nextStageId: string | null) => void;
  /** Some tasks were not loaded, so a stage that looks empty may not be. */
  mayHaveHiddenTasks: boolean;
}

export function manageContextFor(stages: readonly Pick<StageView, "id" | "name">[], index: number, mayHaveHiddenTasks: boolean): StageManagement {
  return {
    afterWhenLeft: index === 0 ? null : (stages[index - 2]?.id ?? ""),
    afterWhenRight: index === stages.length - 1 ? null : stages[index + 1]!.id,
    nextStageId: stages[index + 1]?.id ?? null,
    others: stages.filter((_, i) => i !== index).map(({ id, name }) => ({ id, name })),
    mayHaveHiddenTasks,
  };
}
