import { useFormatter, useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import type { Counts } from "./types";

/** The figures of `Counts` as a labelled definition list. Zeros are shown, never hidden (REQ-DSH-02). */
export function CountsList({ label, counts }: { label: string; counts: Counts }) {
  const t = useTranslations("dashboard.counts");
  const format = useFormatter();
  const rows: [string, string, number, boolean?][] = [
    ["total", t("total"), counts.total],
    ["high", t("high"), counts.byPriority.high],
    ["medium", t("medium"), counts.byPriority.medium],
    ["low", t("low"), counts.byPriority.low],
    ["active", t("active"), counts.byStatus.active],
    ["inactive", t("inactive"), counts.byStatus.inactive],
    ["overdue", t("overdue"), counts.overdue, counts.overdue > 0],
  ];
  return (
    <dl aria-label={label} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {rows.map(([key, name, value, alert]) => (
        <Card key={key} className="p-4">
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-600">{name}</dt>
          <dd className={`mt-1 text-3xl font-semibold tracking-tight ${alert ? "text-danger-700" : "text-slate-900"}`}>{format.number(value)}</dd>
        </Card>
      ))}
    </dl>
  );
}
