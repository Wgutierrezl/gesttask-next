import { useId } from "react";
import { cn } from "@/components/ui/cn";
import { PRIORITY_LABELS } from "./format";
import type { PriorityName } from "./types";

/** Active look per option; literal class names so Tailwind can see them. */
const ACTIVE: Record<PriorityName, string> = {
  low: "has-checked:border-success-600 has-checked:bg-success-soft has-checked:text-success-fg",
  medium: "has-checked:border-warning-600 has-checked:bg-warning-soft has-checked:text-warning-fg",
  high: "has-checked:border-danger-600 has-checked:bg-danger-soft has-checked:text-danger-fg",
};

interface PriorityPickerProps {
  defaultValue?: PriorityName;
  error?: string;
}

/**
 * Priority as a segmented control. Underneath it is a plain radio group (name="priority") in a fieldset, so it
 * submits without JavaScript and keeps arrow-key navigation and screen-reader semantics.
 */
export function PriorityPicker({ defaultValue = "medium", error }: PriorityPickerProps) {
  const errorId = useId();
  return (
    <div className="flex flex-col gap-1">
      <fieldset role="radiogroup" aria-describedby={error ? errorId : undefined} aria-invalid={error ? true : undefined} className="m-0 flex min-w-0 flex-col gap-1 border-0 p-0">
        <legend className="mb-1 p-0 text-sm font-medium text-fg-strong">Priority</legend>
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(PRIORITY_LABELS) as PriorityName[]).map((value) => (
            <label
              key={value}
              className={cn(
                "flex cursor-pointer items-center justify-center rounded-xl border-2 border-border bg-surface px-3 py-2 text-sm font-medium text-fg-strong transition-colors hover:bg-surface-hover",
                "has-focus-visible:outline-2 has-focus-visible:outline-offset-1 has-focus-visible:outline-ring",
                ACTIVE[value],
              )}
            >
              <input type="radio" name="priority" value={value} defaultChecked={value === defaultValue} className="sr-only" />
              {PRIORITY_LABELS[value]}
            </label>
          ))}
        </div>
      </fieldset>
      {error ? <p id={errorId} className="text-xs text-danger-fg">{error}</p> : null}
    </div>
  );
}
