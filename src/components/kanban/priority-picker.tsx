import { useId } from "react";
import { cn } from "@/components/ui/cn";
import { PRIORITY_LABELS } from "./format";
import type { PriorityName } from "./types";

/** Active look per option; literal class names so Tailwind can see them. */
const ACTIVE: Record<PriorityName, string> = {
  low: "has-checked:border-success-600 has-checked:bg-success-50 has-checked:text-success-700",
  medium: "has-checked:border-warning-600 has-checked:bg-warning-50 has-checked:text-warning-700",
  high: "has-checked:border-danger-600 has-checked:bg-danger-50 has-checked:text-danger-700",
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
        <legend className="mb-1 p-0 text-sm font-medium text-slate-700">Priority</legend>
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(PRIORITY_LABELS) as PriorityName[]).map((value) => (
            <label
              key={value}
              className={cn(
                "flex cursor-pointer items-center justify-center rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50",
                "has-focus-visible:outline-2 has-focus-visible:outline-offset-1 has-focus-visible:outline-brand-600",
                ACTIVE[value],
              )}
            >
              <input type="radio" name="priority" value={value} defaultChecked={value === defaultValue} className="sr-only" />
              {PRIORITY_LABELS[value]}
            </label>
          ))}
        </div>
      </fieldset>
      {error ? <p id={errorId} className="text-xs text-danger-700">{error}</p> : null}
    </div>
  );
}
