import type { ReactNode } from "react";
import { cn } from "./cn";

const TONES = {
  neutral: "bg-surface-muted text-fg-muted",
  brand: "bg-brand-soft text-brand-link",
  success: "bg-success-soft text-success-fg",
  warning: "bg-warning-soft text-warning-fg",
  danger: "bg-danger-soft text-danger-fg",
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
