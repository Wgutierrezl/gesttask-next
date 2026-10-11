import type { ReactNode } from "react";
import { cn } from "./cn";

const TONES = {
  neutral: "bg-slate-100 text-slate-700",
  brand: "bg-brand-50 text-brand-700",
  success: "bg-success-50 text-success-700",
  warning: "bg-warning-50 text-warning-700",
  danger: "bg-danger-50 text-danger-700",
} as const;

export type BadgeTone = keyof typeof TONES;

export function Badge({ tone = "neutral", children }: { tone?: BadgeTone; children: ReactNode }) {
  return <span className={cn("inline-flex items-center rounded-pill px-2 py-0.5 text-xs font-medium", TONES[tone])}>{children}</span>;
}

/** Badge tone for a task priority; anything unknown reads as neutral. */
export function priorityTone(priority: string): BadgeTone {
  if (priority === "high") return "danger";
  if (priority === "medium") return "warning";
  return "neutral";
}
