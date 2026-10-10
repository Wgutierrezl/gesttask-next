import Link from "next/link";
import type { ReactNode } from "react";
import { assigneeLabel, formatDate, PRIORITY_LABELS } from "./format";
import type { TaskCardView } from "./types";

const PRIORITY_STYLES = { low: "bg-gray-100 text-gray-800", medium: "bg-blue-100 text-blue-900", high: "bg-red-100 text-red-900" } as const;

/** One task. State is spelled out in text (priority, overdue, completed), never by colour alone. */
export function TaskCard({ task, assigneeName, href, controls }: { task: TaskCardView; assigneeName: string | null; href?: string; controls?: ReactNode }) {
  return (
    <article className="rounded border border-gray-200 bg-white p-3 text-sm shadow-sm">
      <h4 className="font-medium">{href ? <Link href={href} className="underline">{task.title}</Link> : task.title}</h4>
      <p className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        <span className={`rounded px-2 py-0.5 ${PRIORITY_STYLES[task.priority]}`}>{PRIORITY_LABELS[task.priority]}</span>
        {task.dueDate ? <span>Due {formatDate(task.dueDate)}</span> : null}
        {task.overdue ? <span className="rounded bg-red-700 px-2 py-0.5 text-white">Overdue</span> : null}
      </p>
      {task.completedAt ? <p className="mt-1 text-xs text-green-800">Completed {formatDate(task.completedAt)}</p> : null}
      <p className="mt-1 text-xs text-gray-600">{assigneeLabel(task.assigneeId, assigneeName)}</p>
      {controls ? <div className="mt-2 flex flex-wrap items-start gap-2">{controls}</div> : null}
    </article>
  );
}
