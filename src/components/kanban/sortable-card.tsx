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

/*
 * ARIA contract (S18, replaces the "Drag <title>" button of earlier slices):
 * - The card is an `article` named "Drag <title>" (kanban.dragAria), focusable (tabindex 0) and announced as "sortable".
 *   It keeps the article role dnd-kit would turn into "button", because a button may not contain the link and the options
 *   button that live inside the card.
 * - The card is also the keyboard activator: Space on the focused card picks it up (arrows move, Space or Enter drops,
 *   Escape cancels). Keys pressed on the title link, the options button or the menu items never start a drag, so Enter
 *   still follows the link and Space/Enter still operate the buttons.
 * - The accessible way to move a card without dragging is the "Move options for <title>" button (aria-haspopup) and its menu.
 * Tests and e2e find cards with getByRole("article", { name: "Drag <title>" }).
 */

/**
 * A card that is its own drag handle: grab it anywhere with the pointer, hold it on a touch screen, or focus it and press
 * space, the arrows and space again. Its "⋯" menu is the move path that needs no dragging at all.
 */
export function SortableCard({ task, assigneeName, href, columns, otherPipelines, onMove, registerHandle }: SortableCardProps) {
  const t = useTranslations("kanban");
  // The card is an article that holds a link and a menu, so it keeps the article role instead of the default "button" (a
  // button may not contain other controls); the name says what the focused card can do.
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, attributes: { role: "article" } });
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
          // The card itself is the activator: key presses on the link and buttons inside it must not start a drag.
          setActivatorNodeRef(element);
          registerHandle(task.id, element);
        },
        "aria-label": t("dragAria", { title: task.title }),
        style: { transform: CSS.Transform.toString(transform), transition },
        className: cn("cursor-grab touch-manipulation select-none [-webkit-touch-callout:none] active:cursor-grabbing focus-visible:outline-2 focus-visible:outline-ring", isDragging && "opacity-50"),
      }}
      controls={<MoveMenu columns={columns} otherPipelines={otherPipelines} taskId={task.id} title={task.title} onMove={onMove} />}
    />
  );
}
