"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { MoveMenu } from "./move-menu";
import type { MoveRequest } from "./move";
import { TaskCard } from "./task-card";
import type { ColumnView, TaskCardView } from "./types";

interface SortableCardProps {
  task: TaskCardView;
  assigneeName: string | null;
  href: string;
  columns: ColumnView[];
  onMove: (request: MoveRequest) => void;
}

/** A card that can be dragged by its handle with the pointer or the keyboard (space, arrows, space), or moved from its menu. */
export function SortableCard({ task, assigneeName, href, columns, onMove }: SortableCardProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  const handle = (
    <button
      type="button"
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      aria-label={`Drag ${task.title}`}
      className="cursor-grab rounded border border-gray-300 px-2 py-1 text-xs"
    >
      Drag
    </button>
  );
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}>
      <TaskCard
        task={task}
        assigneeName={assigneeName}
        href={href}
        controls={
          <>
            {handle}
            <MoveMenu columns={columns} taskId={task.id} title={task.title} onMove={onMove} />
          </>
        }
      />
    </div>
  );
}
