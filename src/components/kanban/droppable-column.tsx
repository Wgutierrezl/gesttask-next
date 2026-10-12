"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { ReactNode } from "react";
import { ColumnShell } from "./kanban-column";
import { columnId, type MoveRequest } from "./move";
import { SortableCard } from "./sortable-card";
import type { StageManagement } from "./stage-management";
import type { ColumnView, PipelineOption } from "./types";

interface DroppableColumnProps {
  column: ColumnView;
  columns: ColumnView[];
  /** The other pipelines of the board: their stages are extra places the Move menu can send a card to. */
  otherPipelines?: PipelineOption[];
  /** True while a dragged card hovers this stage, whether over its open area or one of its cards. */
  isOver: boolean;
  nameOf: (userId: string) => string | null;
  taskHref: (taskId: string) => string;
  onMove: (request: MoveRequest) => void;
  registerHandle: (taskId: string, element: HTMLElement | null) => void;
  /** Rendered under the cards, e.g. the add-task button. */
  footer?: ReactNode;
  /** Gives the header its stage menu; left out for those who cannot manage stages. */
  manage?: StageManagement;
}

/** A stage that accepts drops on its open area (so an empty stage can receive a card) and sorts the cards inside it. */
export function DroppableColumn({ column, columns, otherPipelines, isOver, nameOf, taskHref, onMove, registerHandle, footer, manage }: DroppableColumnProps) {
  const { setNodeRef } = useDroppable({ id: columnId(column.stage.id) });
  return (
    <SortableContext items={column.tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
      <ColumnShell column={column} listRef={setNodeRef} isOver={isOver} footer={footer} manage={manage}>
        {column.tasks.map((task) => (
          <li key={task.id}>
            <SortableCard task={task} assigneeName={task.assigneeId ? nameOf(task.assigneeId) : null} href={taskHref(task.id)} columns={columns} otherPipelines={otherPipelines} onMove={onMove} registerHandle={registerHandle} />
          </li>
        ))}
      </ColumnShell>
    </SortableContext>
  );
}
