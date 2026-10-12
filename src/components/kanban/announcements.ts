import type { Announcements } from "@dnd-kit/core";
import type { useTranslations } from "next-intl";
import { COLUMN_PREFIX, pipelineOfDroppable } from "./move";
import type { ColumnView, PipelineOption } from "./types";

/** The `kanban` catalog namespace, as `useTranslations("kanban")` or `createTranslator` hand it out. */
export type KanbanT = ReturnType<typeof useTranslations<"kanban">>;

/** Screen-reader announcements for drag and drop that name tasks and stages instead of reading out ids. */
export function announcementsFor(columns: ColumnView[], pipelines: PipelineOption[] = [], t: KanbanT): Announcements {
  const titleOf = (id: string | number) => columns.flatMap((c) => c.tasks).find((task) => task.id === String(id))?.title ?? t("untitled");
  const stageOf = (id: string) => columns.find((c) => c.tasks.some((task) => task.id === id))?.stage.name ?? "";
  const columnName = (id: string) => columns.find((c) => c.stage.id === id.slice(COLUMN_PREFIX.length))?.stage.name ?? "";
  const pipelineName = (id: string) => pipelines.find((p) => p.id === pipelineOfDroppable(id))?.name ?? "";
  const where = (overId: string) =>
    pipelineOfDroppable(overId) !== null
      ? t("announce.wherePipeline", { name: pipelineName(overId) })
      : overId.startsWith(COLUMN_PREFIX)
        ? t("announce.whereColumn", { name: columnName(overId) })
        : t("announce.whereCard", { title: titleOf(overId), stage: stageOf(overId) });
  return {
    onDragStart: ({ active }) => t("announce.pickedUp", { title: titleOf(active.id) }),
    onDragOver: ({ active, over }) => {
      const title = titleOf(active.id);
      if (!over) return t("announce.notOver", { title });
      if (over.id === active.id) return t("announce.original", { title });
      return t("announce.over", { title, where: where(String(over.id)) });
    },
    onDragEnd: ({ active, over }) =>
      over ? t("announce.dropped", { title: titleOf(active.id), where: where(String(over.id)) }) : t("announce.droppedOutside", { title: titleOf(active.id) }),
    onDragCancel: ({ active }) => t("announce.cancelled", { title: titleOf(active.id) }),
  };
}
