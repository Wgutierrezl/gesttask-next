"use client";

import { closestCorners, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { moveTaskAction, moveTaskToEndAction } from "@/app/_actions/tasks";
import { describeFailure } from "@/components/auth/form-error";
import { announcementsFor } from "./announcements";
import { DroppableColumn } from "./droppable-column";
import { KanbanColumn } from "./kanban-column";
import { resolveDrop, type MoveRequest } from "./move";
import { useOptimisticMove, type SendResult } from "./use-optimistic-move";
import type { ColumnView } from "./types";

const FAILED = "The task could not be moved. Try again.";

async function sendMove(request: MoveRequest): Promise<SendResult> {
  const form = new FormData();
  form.set("taskId", request.taskId);
  form.set("toStageId", request.toStageId);
  if (!request.toEnd) form.set("afterTaskId", request.afterTaskId ?? "");
  try {
    const result = await (request.toEnd ? moveTaskToEndAction : moveTaskAction)(undefined, form);
    if (result?.ok) return { ok: true };
    return { ok: false, message: (result && describeFailure(result)) || FAILED };
  } catch {
    return { ok: false, message: FAILED };
  }
}

interface KanbanBoardProps {
  columns: ColumnView[];
  canWrite: boolean;
  /** Display names by user id (plain data, so it can cross from the server page). */
  names: Record<string, string>;
  /** Task detail path without the task id, ending in a slash. */
  taskBase: string;
}

/**
 * The board. Writers can drag cards (pointer or keyboard) or use each card's Move menu; both go through one
 * optimistic path that rolls back and explains when the server refuses. Viewers get the same columns read-only.
 */
export function KanbanBoard({ columns, canWrite, names, taskBase }: KanbanBoardProps) {
  const router = useRouter();
  const [announcement, setAnnouncement] = useState("");
  const handles = useRef(new Map<string, HTMLElement>());
  const registerHandle = useCallback((taskId: string, element: HTMLElement | null) => {
    if (element) handles.current.set(taskId, element);
    else handles.current.delete(taskId);
  }, []);
  const refocus = useRef<string | null>(null);
  const onSettled = (request: MoveRequest, result: SendResult) => {
    const title = columns.flatMap((column) => column.tasks).find((candidate) => candidate.id === request.taskId)?.title ?? "task";
    const stage = columns.find((column) => column.stage.id === request.toStageId)?.stage.name ?? "";
    setAnnouncement(result.ok ? `Moved ${title} to ${stage}` : `Couldn't move ${title} \u2014 restored`);
  };
  const { columns: shown, move: send, errors, pending } = useOptimisticMove(columns, sendMove, { refresh: router.refresh, onSettled });
  const move = (request: MoveRequest) => {
    send(request);
    refocus.current = request.taskId;
    handles.current.get(request.taskId)?.focus();
  };
  // A moved card is a new element, and a rolled-back one is too: once the board has settled, focus returns to its handle.
  useEffect(() => {
    if (pending || refocus.current === null) return;
    handles.current.get(refocus.current)?.focus();
    refocus.current = null;
  }, [pending, shown]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const nameOf = (userId: string) => names[userId] ?? null;
  const taskHref = (taskId: string) => `${taskBase}${taskId}`;
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const request = over ? resolveDrop(shown, String(active.id), String(over.id)) : null;
    if (request) move(request);
  };
  return (
    <>
      <div role="status" aria-label="Board updates" className={errors.length > 0 ? "rounded bg-red-50 px-3 py-2 text-sm text-red-800" : undefined}>
        <span className="sr-only">{announcement}</span>
        {errors.map((message, i) => (
          <p key={i}>{message}</p>
        ))}
      </div>
      <div className="flex gap-4 overflow-x-auto pb-2">
        {canWrite ? (
          <DndContext id="kanban" sensors={sensors} collisionDetection={closestCorners} accessibility={{ announcements: announcementsFor(shown) }} onDragEnd={onDragEnd}>
            {shown.map((column) => (
              <DroppableColumn key={column.stage.id} column={column} columns={shown} nameOf={nameOf} taskHref={taskHref} onMove={move} registerHandle={registerHandle} />
            ))}
          </DndContext>
        ) : (
          shown.map((column) => <KanbanColumn key={column.stage.id} column={column} nameOf={nameOf} taskHref={taskHref} />)
        )}
      </div>
    </>
  );
}
