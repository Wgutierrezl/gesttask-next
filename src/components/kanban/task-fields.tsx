import type { ActionFailure } from "@/application/result";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { PriorityPicker } from "./priority-picker";
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

/** The fields a task is created and edited with; `prefix` keeps ids unique when several forms share a page. */
export function TaskFields({ prefix, members, defaults = {}, failure }: { prefix: string; members: MemberOption[]; defaults?: TaskDefaults; failure?: ActionFailure }) {
  const errors = failure?.fieldErrors;
  return (
    <>
      <Field label="Title" error={errors?.title?.join(" ")}>
        <Input id={`${prefix}-title`} name="title" required maxLength={120} defaultValue={defaults.title} />
      </Field>
      <Field label="Description" error={errors?.description?.join(" ")}>
        <Textarea id={`${prefix}-description`} name="description" rows={3} maxLength={5000} defaultValue={defaults.description} />
      </Field>
      <PriorityPicker prefix={prefix} defaultValue={defaults.priority} error={errors?.priority?.join(" ")} />
      <Field label="Due date" error={errors?.dueDate?.join(" ")}>
        <Input id={`${prefix}-due`} name="dueDate" type="date" defaultValue={defaults.dueDate ?? ""} />
      </Field>
      <Field label="Assignee" error={errors?.assigneeId?.join(" ")}>
        <Select id={`${prefix}-assignee`} name="assigneeId" defaultValue={defaults.assigneeId ?? ""}>
          <option value="">Unassigned</option>
          {members.map((member) => (
            <option key={member.userId} value={member.userId}>{member.name}</option>
          ))}
        </Select>
      </Field>
    </>
  );
}
