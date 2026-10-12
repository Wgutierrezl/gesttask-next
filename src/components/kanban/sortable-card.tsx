"use client";

import { GripVertical } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { MoveMenu } from "./move-menu";
import type { MoveRequest } from "./move";
import { TaskCard } from "./task-card";
import type { ColumnView, PipelineOption, TaskCardView } from "./types";

interface SortableCardProps {
  task: TaskCardView;
  assigneeName: string | null;
  href: string;
  columns: ColumnView[];
  otherPipelines?: PipelineOption[];
  onMove: (request: MoveRequest) => void;
  /** Lets the board find the handle again to put focus back after a move. */
  registerHandle: (taskId: string, element: HTMLElement | null) => void;
}

/** A card that can be dragged by its handle with the pointer or the keyboard (space, arrows, space), or moved from its menu. */
export function SortableCard({ task, assigneeName, href, columns, otherPipelines, onMove, registerHandle }: SortableCardProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  const handle = (
    <button
      type="button"
      ref={(element) => {
        setActivatorNodeRef(element);
        registerHandle(task.id, element);
      }}
      {...attributes}
      {...listeners}
      aria-label={`Drag ${task.title}`}
      className="inline-flex h-7 cursor-grab touch-none items-center gap-1 rounded-control border border-border-strong bg-surface px-2 text-xs text-fg-strong hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-ring active:cursor-grabbing"
    >
      <GripVertical aria-hidden="true" className="size-3.5" />
      Drag
    </button>
  );
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}>
      <TaskCard
        task={task}
        assigneeName={assigneeName}
        href={href}
        controls={
          <>
            {handle}
            <MoveMenu columns={columns} otherPipelines={otherPipelines} taskId={task.id} title={task.title} onMove={onMove} />
          </>
        }
      />
    </div>
  );
}
