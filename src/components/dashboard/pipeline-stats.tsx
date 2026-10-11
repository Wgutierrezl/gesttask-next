import { useFormatter, useTranslations } from "next-intl";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import type { PipelineStatsData } from "./types";

/** One pipeline as a table, a row per stage in board order; stages with no tasks still appear, with zeros. */
export function PipelineStats({ pipeline, boardId }: { pipeline: PipelineStatsData; boardId: string }) {
  const t = useTranslations("dashboard");
  const format = useFormatter();
  return (
    <Card className="overflow-x-auto p-4">
      <table className="w-full min-w-[32rem] border-collapse text-sm">
        <caption className="mb-2 text-left">
          <Link href={`/boards/${boardId}/pipelines/${pipeline.id}`} className="font-semibold text-brand-700 underline">
            {pipeline.name}
          </Link>
          <span className="ml-2 text-slate-600">{t("tasks", { count: pipeline.tasks.total })}</span>
        </caption>
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-600">
            <th scope="col" className="py-1 pr-3">{t("stage")}</th>
            {(["total", "high", "medium", "low", "overdue"] as const).map((name) => (
              <th key={name} scope="col" className="px-2 py-1 text-right">{t(`counts.${name}`)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {pipeline.stages.length === 0 ? (
            <tr><td colSpan={6} className="py-2 text-slate-600">{t("noStages")}</td></tr>
          ) : (
            pipeline.stages.map(({ id, name, isDone, tasks }) => (
              <tr key={id} className="border-b border-slate-100">
                <th scope="row" className="py-1 pr-3 text-left font-normal">
                  {name}
                  {isDone ? <span className="ml-1 text-xs text-slate-600">{t("doneStage")}</span> : null}
                </th>
                <td className="px-2 text-right">{format.number(tasks.total)}</td>
                <td className="px-2 text-right">{format.number(tasks.byPriority.high)}</td>
                <td className="px-2 text-right">{format.number(tasks.byPriority.medium)}</td>
                <td className="px-2 text-right">{format.number(tasks.byPriority.low)}</td>
                <td className={`px-2 text-right ${tasks.overdue > 0 ? "text-danger-700" : ""}`}>{format.number(tasks.overdue)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </Card>
  );
}
