import { Card } from "@/components/ui/card";
import type { Counts } from "./types";

/** The figures of `Counts` as a labelled definition list. Zeros are shown, never hidden (REQ-DSH-02). */
export function CountsList({ label, counts }: { label: string; counts: Counts }) {
  const rows: [string, number, boolean?][] = [
    ["Total", counts.total],
    ["High", counts.byPriority.high],
    ["Medium", counts.byPriority.medium],
    ["Low", counts.byPriority.low],
    ["Active", counts.byStatus.active],
    ["Inactive", counts.byStatus.inactive],
    ["Overdue", counts.overdue, counts.overdue > 0],
  ];
  return (
    <dl aria-label={label} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {rows.map(([name, value, alert]) => (
        <Card key={name} className="p-4">
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-600">{name}</dt>
          <dd className={`mt-1 text-3xl font-semibold tracking-tight ${alert ? "text-red-700" : "text-slate-900"}`}>{value}</dd>
        </Card>
      ))}
    </dl>
  );
}
