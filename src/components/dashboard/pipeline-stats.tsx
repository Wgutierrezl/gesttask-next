import { useFormatter, useTranslations } from "next-intl";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import type { PipelineStatsData } from "./types";

/** One pipeline as a table, a row per stage in board order; stages with no tasks still appear, with zeros. */
export function PipelineStats({ pipeline, boardId }: { pipeline: PipelineStatsData; boardId: string }) {
  const t = useTranslations("dashboard");
  const format = useFormatter();
  return (
    <Card className="overflow-x-auto rounded-2xl p-6">
      <table className="w-full min-w-[32rem] border-collapse text-sm">
        <caption className="mb-2 text-left">
          <Link href={`/boards/${boardId}/pipelines/${pipeline.id}`} className="font-semibold text-brand-link underline">
            {pipeline.name}
          </Link>
          <span className="ml-2 text-fg-muted">{t("tasks", { count: pipeline.tasks.total })}</span>
        </caption>
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-fg-muted">
            <th scope="col" className="py-1 pr-3">{t("stage")}</th>
            {(["total", "high", "medium", "low", "overdue"] as const).map((name) => (
              <th key={name} scope="col" className="px-2 py-1 text-right">{t(`counts.${name}`)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {pipeline.stages.length === 0 ? (
            <tr><td colSpan={6} className="py-2 text-fg-muted">{t("noStages")}</td></tr>
          ) : (
            pipeline.stages.map(({ id, name, isDone, tasks }) => (
              <tr key={id} className="border-b border-border-subtle">
                <th scope="row" className="py-1 pr-3 text-left font-normal">
                  {name}
                  {isDone ? <span className="ml-1 text-xs text-fg-muted">{t("doneStage")}</span> : null}
                </th>
                <td className="px-2 text-right">{format.number(tasks.total)}</td>
                <td className="px-2 text-right">{format.number(tasks.byPriority.high)}</td>
                <td className="px-2 text-right">{format.number(tasks.byPriority.medium)}</td>
                <td className="px-2 text-right">{format.number(tasks.byPriority.low)}</td>
                <td className={`px-2 text-right ${tasks.overdue > 0 ? "text-danger-fg" : ""}`}>{format.number(tasks.overdue)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </Card>
  );
}
