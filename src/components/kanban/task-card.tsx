import { AlertCircle, Calendar } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/components/ui/cn";
import { formatDate, formatDay } from "./format";
import { LocalTime } from "./local-time";
import type { Locale } from "@/i18n/config";
import type { PriorityName, TaskCardView } from "./types";

const PRIORITY_STYLE: Record<PriorityName, { dot: string; text: string }> = {
  low: { dot: "bg-success-600", text: "text-success-fg" },
  medium: { dot: "bg-warning-600", text: "text-warning-fg" },
  high: { dot: "bg-danger-600", text: "text-danger-fg" },
};

/**
 * One task. State is spelled out in text (priority, overdue, completed), never by colour alone: the chips show the short
 * form and an equivalent sentence stays in the page for assistive tech.
 */
export function TaskCard({ task, assigneeName, href, controls, lifted = false, articleProps }: { task: TaskCardView; assigneeName: string | null; href?: string; controls?: ReactNode; lifted?: boolean; /** What turns the card into a draggable: ref, listeners, accessibility attributes and the transform. */ articleProps?: ComponentProps<"article"> }) {
  const locale = useLocale() as Locale;
  const t = useTranslations("kanban");
  // A completed task is not late any more, whatever the server last said about its due date.
  const overdue = task.overdue && !task.completedAt;
  const priority = PRIORITY_STYLE[task.priority];
  const assignee = assigneeName ? (
    <span aria-hidden="true" title={assigneeName} className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-gradient text-xs font-medium text-white">
      {[...assigneeName.trim()][0]?.toUpperCase() ?? "?"}
    </span>
  ) : null;
  const hasFooter = Boolean(assignee || task.dueDate || task.completedAt);
  return (
    <article
      {...articleProps}
      className={cn(
        "group/card relative rounded-xl border bg-surface p-4 text-sm transition duration-[var(--duration-fast)] ease-[var(--ease-out-soft)]",
        lifted ? "cursor-grabbing border-border-hover shadow-card" : "border-border hover:border-border-hover hover:shadow-card",
        articleProps?.className,
      )}
    >
      <p className="mb-2 flex items-center gap-2 text-xs">
        <span aria-hidden="true" className={cn("size-1.5 rounded-full", priority.dot)} />
        <span className={priority.text}>{t(`priority.${task.priority}`)}</span>
      </p>
      <h4 className="line-clamp-2 text-base font-medium text-fg transition-colors group-hover/card:text-brand-link">
        {href ? <Link href={href} draggable={false} className="after:absolute after:inset-0 after:rounded-xl focus-visible:outline-2 focus-visible:outline-ring">{task.title}</Link> : task.title}
      </h4>
      {task.description ? <p className="mt-2 line-clamp-2 text-sm text-fg-subtle">{task.description}</p> : null}
      {hasFooter ? (
        <footer className="mt-3 flex items-center justify-between gap-2 border-t border-border-subtle pt-3">
          <div className="flex min-w-0 items-center gap-2">
            {assignee}
            <span className="sr-only">{task.assigneeId === null ? t("unassigned") : (assigneeName ?? t("formerMember"))}</span>
            {task.dueDate ? (
              <time dateTime={task.dueDate} className={cn("flex items-center gap-1 rounded-lg px-2 py-1 text-xs", overdue ? "border border-danger-edge bg-danger-soft text-danger-fg" : "bg-surface-hover text-fg-muted")}>
                {overdue ? <AlertCircle aria-hidden="true" className="size-3" /> : null}
                <Calendar aria-hidden="true" className="size-3" />
                <span aria-hidden="true">{formatDay(task.dueDate, locale)}</span>
                <span className="sr-only">{t("due", { date: formatDate(task.dueDate, locale) })}</span>
                {overdue ? <span className="sr-only">{t("overdue")}</span> : null}
              </time>
            ) : null}
          </div>
          {task.completedAt ? (
            <span className="shrink-0 rounded-lg bg-success-soft px-2 py-1 text-xs text-success-fg">
              <span aria-hidden="true">{t("doneChip")}</span>
              <span className="sr-only"><LocalTime iso={task.completedAt} label={t("completed")} /></span>
            </span>
          ) : null}
        </footer>
      ) : <span className="sr-only">{task.assigneeId === null ? t("unassigned") : (assigneeName ?? t("formerMember"))}</span>}
      {controls}
    </article>
  );
}
