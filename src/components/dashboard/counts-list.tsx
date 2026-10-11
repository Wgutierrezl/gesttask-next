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
        <div key={name} className="rounded border border-gray-200 p-3">
          <dt className="text-xs uppercase tracking-wide text-gray-600">{name}</dt>
          <dd className={`text-2xl font-semibold ${alert ? "text-red-700" : ""}`}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
