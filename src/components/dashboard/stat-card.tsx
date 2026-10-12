import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";

/** Literal class names so Tailwind can see them: the icon box gradient and the figure color of each tone. */
const TONES = {
  blue: { box: "bg-stat-blue-gradient", figure: "text-stat-blue" },
  violet: { box: "bg-stat-violet-gradient", figure: "text-stat-violet" },
  green: { box: "bg-stat-green-gradient", figure: "text-stat-green" },
  orange: { box: "bg-stat-orange-gradient", figure: "text-stat-orange" },
  pink: { box: "bg-stat-pink-gradient", figure: "text-stat-pink" },
} as const;

export type StatTone = keyof typeof TONES;

/** The gradient square with a white glyph that heads a stat card (decorative). */
export function StatIcon({ icon, tone }: { icon: ReactNode; tone: StatTone }) {
  return (
    <span aria-hidden="true" className={cn("flex size-12 items-center justify-center rounded-xl text-white [&>svg]:size-6", TONES[tone].box)}>
      {icon}
    </span>
  );
}

interface StatCardProps {
  icon: ReactNode;
  tone: StatTone;
  label: string;
  value: string;
  /** Paints the figure in the danger color instead of its tone, e.g. overdue work. */
  alert?: boolean;
}

/**
 * One figure of a dashboard like v1's: icon box, a big colored number and its label under it. It is a term and its
 * definition (for a surrounding `<dl>`), with the label first in the source and the figure first on screen.
 */
export function StatCard({ icon, tone, label, value, alert = false }: StatCardProps) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-6 shadow-card">
      <StatIcon icon={icon} tone={tone} />
      <dt className="order-2 text-sm text-fg-muted">{label}</dt>
      <dd className={cn("order-1 text-3xl", alert ? "text-danger-fg" : TONES[tone].figure)}>{value}</dd>
    </div>
  );
}
