import { Calendar, User } from "lucide-react";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("kanban");
  const errors = failure?.fieldErrors;
  return (
    <>
      <Field label={t("fields.title")} error={errors?.title?.join(" ")}>
        <Input id={`${prefix}-title`} name="title" required maxLength={120} placeholder={t("placeholders.title")} defaultValue={defaults.title} />
      </Field>
      <Field label={t("fields.description")} error={errors?.description?.join(" ")}>
        <Textarea id={`${prefix}-description`} name="description" rows={3} maxLength={5000} placeholder={t("placeholders.description")} defaultValue={defaults.description} />
      </Field>
      <PriorityPicker defaultValue={defaults.priority} error={errors?.priority?.join(" ")} />
      <Field label={t("fields.assignee")} labelIcon={<User />} error={errors?.assigneeId?.join(" ")}>
        <Select id={`${prefix}-assignee`} name="assigneeId" defaultValue={defaults.assigneeId ?? ""}>
          <option value="">{t("unassigned")}</option>
          {members.map((member) => (
            <option key={member.userId} value={member.userId}>{member.name}</option>
          ))}
        </Select>
      </Field>
      <Field label={t("fields.dueDate")} labelIcon={<Calendar />} error={errors?.dueDate?.join(" ")}>
        <Input id={`${prefix}-due`} name="dueDate" type="date" defaultValue={defaults.dueDate ?? ""} />
      </Field>
    </>
  );
}
