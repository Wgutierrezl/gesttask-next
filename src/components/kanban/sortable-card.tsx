"use client";

import { useTranslations } from "next-intl";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/components/ui/cn";
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
  /** Lets the board find the card again to put focus back after a move. */
  registerHandle: (taskId: string, element: HTMLElement | null) => void;
}

/**
 * A card that is its own drag handle: grab it anywhere with the pointer, hold it on a touch screen, or focus it and press
 * space, the arrows and space again. Its "⋯" menu is the move path that needs no dragging at all.
 */
export function SortableCard({ task, assigneeName, href, columns, otherPipelines, onMove, registerHandle }: SortableCardProps) {
  const t = useTranslations("kanban");
  // The card is an article that holds a link and a menu, so it keeps the article role instead of the default "button" (a
  // button may not contain other controls); the name says what the focused card can do.
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, attributes: { role: "article" } });
  return (
    <TaskCard
      task={task}
      assigneeName={assigneeName}
      href={href}
      articleProps={{
        ...attributes,
        ...listeners,
        ref: (element: HTMLElement | null) => {
          setNodeRef(element);
          registerHandle(task.id, element);
        },
        "aria-label": t("dragAria", { title: task.title }),
        style: { transform: CSS.Transform.toString(transform), transition },
        className: cn("cursor-grab touch-manipulation active:cursor-grabbing focus-visible:outline-2 focus-visible:outline-ring", isDragging && "opacity-40"),
      }}
      controls={<MoveMenu columns={columns} otherPipelines={otherPipelines} taskId={task.id} title={task.title} onMove={onMove} />}
    />
  );
}
