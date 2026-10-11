import Link from "next/link";
import type { ReactNode } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Badge, priorityTone } from "@/components/ui/badge";
import { cn } from "@/components/ui/cn";
import { assigneeLabel, formatDate, PRIORITY_LABELS } from "./format";
import { LocalTime } from "./local-time";
import type { PriorityName, TaskCardView } from "./types";

const PRIORITY_BORDER: Record<PriorityName, string> = { low: "border-l-slate-300", medium: "border-l-warning-600", high: "border-l-danger-600" };

/** One task. State is spelled out in text (priority, overdue, completed), never by colour alone. */
export function TaskCard({ task, assigneeName, href, controls, lifted = false }: { task: TaskCardView; assigneeName: string | null; href?: string; controls?: ReactNode; lifted?: boolean }) {
  // A completed task is not late any more, whatever the server last said about its due date.
  const overdue = task.overdue && !task.completedAt;
  return (
    <article
      className={cn(
        "rounded-card border border-l-4 border-y-slate-200 border-r-slate-200 bg-white p-3 text-sm shadow-card transition duration-[var(--duration-fast)] ease-[var(--ease-out-soft)] hover:shadow-pop",
        PRIORITY_BORDER[task.priority],
        lifted && "rotate-2 shadow-pop",
      )}
    >
      <h4 className="font-medium text-slate-900">{href ? <Link href={href} className="hover:text-brand-700 hover:underline focus-visible:outline-2 focus-visible:outline-brand-600">{task.title}</Link> : task.title}</h4>
      <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
        <Badge tone={priorityTone(task.priority)}>{PRIORITY_LABELS[task.priority]}</Badge>
        {task.dueDate ? <time dateTime={task.dueDate} className={overdue ? "font-medium text-danger-700" : undefined}>Due {formatDate(task.dueDate)}</time> : null}
        {overdue ? <Badge tone="danger">Overdue</Badge> : null}
      </p>
      {task.completedAt ? <p className="mt-1 text-xs text-success-700"><LocalTime iso={task.completedAt} label="Completed" /></p> : null}
      <p className="mt-2 flex items-center gap-2 text-xs text-slate-600">
        {assigneeName ? <Avatar name={assigneeName} size="sm" /> : null}
        <span>{assigneeLabel(task.assigneeId, assigneeName)}</span>
      </p>
      {controls ? <div className="mt-3 flex flex-wrap items-start gap-2">{controls}</div> : null}
    </article>
  );
}
