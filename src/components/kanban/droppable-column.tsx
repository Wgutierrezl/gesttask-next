"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { ColumnShell } from "./kanban-column";
import { columnId, type MoveRequest } from "./move";
import { SortableCard } from "./sortable-card";
import type { ColumnView } from "./types";

interface DroppableColumnProps {
  column: ColumnView;
  columns: ColumnView[];
  nameOf: (userId: string) => string | null;
  taskHref: (taskId: string) => string;
  onMove: (request: MoveRequest) => void;
}

/** A stage that accepts drops on its open area (so an empty stage can receive a card) and sorts the cards inside it. */
export function DroppableColumn({ column, columns, nameOf, taskHref, onMove }: DroppableColumnProps) {
  const { setNodeRef } = useDroppable({ id: columnId(column.stage.id) });
  return (
    <SortableContext items={column.tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
      <ColumnShell column={column} listRef={setNodeRef}>
        {column.tasks.map((task) => (
          <li key={task.id}>
            <SortableCard task={task} assigneeName={task.assigneeId ? nameOf(task.assigneeId) : null} href={taskHref(task.id)} columns={columns} onMove={onMove} />
          </li>
        ))}
      </ColumnShell>
    </SortableContext>
  );
}
