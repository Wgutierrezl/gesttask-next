import type { ReactNode } from "react";
import type { ActionFailure } from "@/application/result";
import { PRIORITY_LABELS } from "./format";
import type { MemberOption, PriorityName } from "./types";

export interface TaskDefaults {
  title?: string;
  description?: string;
  priority?: PriorityName;
  dueDate?: string | null;
  assigneeId?: string | null;
}

/** Names of the fields rendered here, so the form's alert region does not repeat their inline errors. */
export const TASK_FIELD_NAMES = ["title", "description", "priority", "dueDate", "assigneeId"] as const;

const CONTROL = "rounded border border-gray-300 px-3 py-2 text-sm";

function Field({ id, label, errors, children }: { id: string; label: string; errors?: string[]; children: (aria: Record<string, unknown>) => ReactNode }) {
  const errorId = `${id}-error`;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      {children({ id, "aria-invalid": errors ? true : undefined, "aria-describedby": errors ? errorId : undefined })}
      {errors ? <p id={errorId} role="alert" className="text-sm text-red-700">{errors.join(" ")}</p> : null}
    </div>
  );
}

/** The fields a task is created and edited with; `prefix` keeps ids unique when several forms share a page. */
export function TaskFields({ prefix, members, defaults = {}, failure }: { prefix: string; members: MemberOption[]; defaults?: TaskDefaults; failure?: ActionFailure }) {
  const errors = failure?.fieldErrors;
  return (
    <>
      <Field id={`${prefix}-title`} label="Title" errors={errors?.title}>
        {(aria) => <input {...aria} name="title" required maxLength={120} defaultValue={defaults.title} className={CONTROL} />}
      </Field>
      <Field id={`${prefix}-description`} label="Description" errors={errors?.description}>
        {(aria) => <textarea {...aria} name="description" rows={3} maxLength={5000} defaultValue={defaults.description} className={CONTROL} />}
      </Field>
      <Field id={`${prefix}-priority`} label="Priority" errors={errors?.priority}>
        {(aria) => (
          <select {...aria} name="priority" defaultValue={defaults.priority ?? "medium"} className={CONTROL}>
            {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        )}
      </Field>
      <Field id={`${prefix}-due`} label="Due date" errors={errors?.dueDate}>
        {(aria) => <input {...aria} name="dueDate" type="date" defaultValue={defaults.dueDate ?? ""} className={CONTROL} />}
      </Field>
      <Field id={`${prefix}-assignee`} label="Assignee" errors={errors?.assigneeId}>
        {(aria) => (
          <select {...aria} name="assigneeId" defaultValue={defaults.assigneeId ?? ""} className={CONTROL}>
            <option value="">Unassigned</option>
            {members.map((member) => (
              <option key={member.userId} value={member.userId}>{member.name}</option>
            ))}
          </select>
        )}
      </Field>
    </>
  );
}
