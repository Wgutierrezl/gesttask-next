import type { Announcements } from "@dnd-kit/core";
import { COLUMN_PREFIX } from "./move";
import type { ColumnView } from "./types";

/** Screen-reader announcements for drag and drop that name tasks and stages instead of reading out ids. */
export function announcementsFor(columns: ColumnView[]): Announcements {
  const titleOf = (id: string | number) => columns.flatMap((c) => c.tasks).find((t) => t.id === String(id))?.title ?? "task";
  const stageOf = (id: string) => columns.find((c) => c.tasks.some((t) => t.id === id))?.stage.name ?? "";
  const columnName = (id: string) => columns.find((c) => c.stage.id === id.slice(COLUMN_PREFIX.length))?.stage.name ?? "";
  const where = (overId: string) =>
    overId.startsWith(COLUMN_PREFIX) ? `the ${columnName(overId)} column` : `${titleOf(overId)} in ${stageOf(overId)}`;
  return {
    onDragStart: ({ active }) => `Picked up ${titleOf(active.id)}.`,
    onDragOver: ({ active, over }) => (over ? `${titleOf(active.id)} is over ${where(String(over.id))}.` : `${titleOf(active.id)} is not over a drop area.`),
    onDragEnd: ({ active, over }) =>
      over
        ? `Dropped ${titleOf(active.id)} on ${where(String(over.id))}.`
        : `${titleOf(active.id)} was dropped outside the board and stays where it was.`,
    onDragCancel: ({ active }) => `Move cancelled. ${titleOf(active.id)} stays where it was.`,
  };
}
