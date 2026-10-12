import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Badge, priorityTone } from "@/components/ui/badge";
import { cn } from "@/components/ui/cn";
import { formatDate } from "./format";
import { LocalTime } from "./local-time";
import type { Locale } from "@/i18n/config";
import type { PriorityName, TaskCardView } from "./types";

const PRIORITY_BORDER: Record<PriorityName, string> = { low: "border-l-border-strong", medium: "border-l-warning-600", high: "border-l-danger-600" };

/** One task. State is spelled out in text (priority, overdue, completed), never by colour alone. */
export function TaskCard({ task, assigneeName, href, controls, lifted = false, articleProps }: { task: TaskCardView; assigneeName: string | null; href?: string; controls?: ReactNode; lifted?: boolean; /** What turns the card into a draggable: ref, listeners, accessibility attributes and the transform. */ articleProps?: ComponentProps<"article"> }) {
  const locale = useLocale() as Locale;
  const t = useTranslations("kanban");
  // A completed task is not late any more, whatever the server last said about its due date.
  const overdue = task.overdue && !task.completedAt;
  return (
    <article
      {...articleProps}
      className={cn(
        "group/card relative rounded-card border border-l-4 border-y-border border-r-border bg-surface p-3 text-sm shadow-card transition duration-[var(--duration-fast)] ease-[var(--ease-out-soft)] hover:shadow-pop",
        PRIORITY_BORDER[task.priority],
        lifted && "cursor-grabbing",
        articleProps?.className,
      )}
    >
      <h4 className="font-medium text-fg">{href ? <Link href={href} draggable={false} className="after:absolute after:inset-0 after:rounded-card hover:text-brand-link hover:underline focus-visible:outline-2 focus-visible:outline-ring">{task.title}</Link> : task.title}</h4>
      <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-fg-muted">
        <Badge tone={priorityTone(task.priority)}>{t(`priority.${task.priority}`)}</Badge>
        {task.dueDate ? <time dateTime={task.dueDate} className={overdue ? "font-medium text-danger-fg" : undefined}>{t("due", { date: formatDate(task.dueDate, locale) })}</time> : null}
        {overdue ? <Badge tone="danger">{t("overdue")}</Badge> : null}
      </p>
      {task.completedAt ? <p className="mt-1 text-xs text-success-fg"><LocalTime iso={task.completedAt} label={t("completed")} /></p> : null}
      <p className="mt-2 flex items-center gap-2 text-xs text-fg-muted">
        {assigneeName ? <Avatar name={assigneeName} size="sm" /> : null}
        <span>{task.assigneeId === null ? t("unassigned") : (assigneeName ?? t("formerMember"))}</span>
      </p>
      {controls}
    </article>
  );
}
