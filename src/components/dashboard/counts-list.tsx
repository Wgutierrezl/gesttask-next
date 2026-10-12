import { AlertTriangle, CheckCircle2, ClipboardList, Pause, SignalHigh, SignalLow, SignalMedium } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { StatCard, type StatTone } from "./stat-card";
import type { Counts } from "./types";

type Row = [key: string, label: string, value: number, icon: ReactNode, tone: StatTone, alert?: boolean];

/** The figures of `Counts` as a labelled definition list of stat cards. Zeros are shown, never hidden (REQ-DSH-02). */
export function CountsList({ label, counts }: { label: string; counts: Counts }) {
  const t = useTranslations("dashboard.counts");
  const format = useFormatter();
  const rows: Row[] = [
    ["total", t("total"), counts.total, <ClipboardList key="i" />, "blue"],
    ["high", t("high"), counts.byPriority.high, <SignalHigh key="i" />, "pink"],
    ["medium", t("medium"), counts.byPriority.medium, <SignalMedium key="i" />, "orange"],
    ["low", t("low"), counts.byPriority.low, <SignalLow key="i" />, "green"],
    ["active", t("active"), counts.byStatus.active, <CheckCircle2 key="i" />, "violet"],
    ["inactive", t("inactive"), counts.byStatus.inactive, <Pause key="i" />, "blue"],
    ["overdue", t("overdue"), counts.overdue, <AlertTriangle key="i" />, "pink", counts.overdue > 0],
  ];
  return (
    <dl aria-label={label} className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {rows.map(([key, name, value, icon, tone, alert]) => (
        <StatCard key={key} icon={icon} tone={tone} label={name} value={format.number(value)} alert={alert} />
      ))}
    </dl>
  );
}
