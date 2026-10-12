"use client";

import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent, type DragOverEvent } from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { moveTaskAction, moveTaskToEndAction } from "@/app/_actions/tasks";
import { cn } from "@/components/ui/cn";
import { describeFailure, type AuthErrors } from "@/components/auth/form-error";
import { AddStageColumn } from "./add-stage-column";
import { AddTaskButton } from "./add-task-button";
import { TaskCard } from "./task-card";
import { announcementsFor } from "./announcements";
import { DroppableColumn } from "./droppable-column";
import { KanbanColumn } from "./kanban-column";
import { collideBoard } from "./collision";
import { PipelineTabs, tabElementId, type PipelineSwitcherData } from "./pipeline-tabs";
import { resolveDrop, resolveTabDrop, stageOfDroppable, type MoveRequest } from "./move";
import { manageContextFor } from "./stage-management";
import { useOptimisticMove, type SendResult } from "./use-optimistic-move";
import type { ColumnView, MemberOption } from "./types";

async function sendMove(request: MoveRequest, t: AuthErrors, failed: string): Promise<SendResult> {
  const form = new FormData();
  form.set("taskId", request.taskId);
  form.set("toStageId", request.toStageId);
  if (!request.toEnd) form.set("afterTaskId", request.afterTaskId ?? "");
  try {
    const result = await (request.toEnd ? moveTaskToEndAction : moveTaskAction)(undefined, form);
    if (result?.ok) return { ok: true };
    return { ok: false, message: (result && describeFailure(result, [], t)) || failed };
  } catch {
    return { ok: false, message: failed };
  }
}

interface KanbanBoardProps {
  columns: ColumnView[];
  canWrite: boolean;
  /** Display names by user id (plain data, so it can cross from the server page). */
  names: Record<string, string>;
  /** Task detail path without the task id, ending in a slash. */
  taskBase: string;
  /** The board's pipelines, for the tabs and for moving cards between pipelines. Without it (or with one pipeline) the board is self-contained. */
  switcher?: PipelineSwitcherData;
  /** Who a new task can be assigned to. Writers get an add-task button per column only when this is given. */
  members?: MemberOption[];
  /** The owner can rename, reorder, flag as done and delete stages from each column, and add one at the end. Needs `pipelineId`. */
  canManageStages?: boolean;
  pipelineId?: string;
  /** Some tasks were not loaded: no stage is assumed empty when one is deleted. */
  tasksTruncated?: boolean;
}

/**
 * The board. Writers can drag cards (pointer or keyboard) or use each card's Move menu; both go through one
 * optimistic path that rolls back and explains when the server refuses. Viewers get the same columns read-only.
 */
export function KanbanBoard({ columns, canWrite, names, taskBase, switcher, members, canManageStages = false, pipelineId, tasksTruncated = false }: KanbanBoardProps) {
  const router = useRouter();
  const tErrors = useTranslations("auth.errors");
  const t = useTranslations("kanban");
  const sendWithErrors = useCallback((request: MoveRequest) => sendMove(request, tErrors, t("moveFailed")), [tErrors, t]);
  const [announcement, setAnnouncement] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overStageId, setOverStageId] = useState<string | null>(null);
  const handles = useRef(new Map<string, HTMLElement>());
  const registerHandle = useCallback((taskId: string, element: HTMLElement | null) => {
    if (element) handles.current.set(taskId, element);
    else handles.current.delete(taskId);
  }, []);
  const refocus = useRef<string | null>(null);
  const [crossError, setCrossError] = useState<string | null>(null);
  const crossing = useRef(false);
  const [crossPending, setCrossPending] = useState(false);
  const onSettled = (request: MoveRequest, result: SendResult) => {
    const title = columns.flatMap((column) => column.tasks).find((candidate) => candidate.id === request.taskId)?.title ?? t("untitled");
    const stage = columns.find((column) => column.stage.id === request.toStageId)?.stage.name ?? "";
    setAnnouncement(result.ok ? t("announce.moved", { title, destination: stage }) : t("announce.restored", { title }));
    if (result.ok) setCrossError(null);
  };
  const { columns: shown, move: send, queue, errors, pending } = useOptimisticMove(columns, sendWithErrors, { refresh: router.refresh, onSettled });
  const pipelines = switcher && switcher.pipelines.length > 1 ? switcher.pipelines : [];
  /** Not optimistic: the card belongs to another page afterwards, so the server answers first and the page is re-read. */
  const moveAcross = async (request: MoveRequest, destination: string) => {
    if (crossing.current) return; // one move across at a time: a second drop would race the first one's refresh
    crossing.current = true;
    setCrossPending(true);
    const title = shown.flatMap((column) => column.tasks).find((candidate) => candidate.id === request.taskId)?.title ?? t("untitled");
    setCrossError(null);
    setAnnouncement(t("announce.moving", { title, destination }));
    // Queued behind any move still in flight inside this pipeline, so the server sees them in the order they were made.
    const result = await queue(() => sendWithErrors(request));
    setAnnouncement(result.ok ? t("announce.moved", { title, destination }) : t("announce.failedAcross", { title }));
    if (!result.ok) setCrossError(result.message);
    router.refresh();
    crossing.current = false;
    setCrossPending(false);
    // The card left this page: focus follows it to the tab of its new pipeline, or goes back to it when the move was refused.
    const target = pipelines.find((pipeline) => pipeline.stages.some((stage) => stage.id === request.toStageId));
    const next = result.ok && target ? document.getElementById(tabElementId(target.id)) : handles.current.get(request.taskId);
    next?.focus();
  };
  const destinationOf = (stageId: string) => {
    const pipeline = pipelines.find((candidate) => candidate.stages.some((stage) => stage.id === stageId));
    const stage = pipeline?.stages.find((candidate) => candidate.id === stageId);
    return pipeline && stage ? t("announce.destination", { stage: stage.name, pipeline: pipeline.name }) : t("announce.anotherPipeline");
  };
  const move = (request: MoveRequest) => {
    if (!shown.some((column) => column.stage.id === request.toStageId)) {
      void moveAcross(request, destinationOf(request.toStageId));
      return;
    }
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
  // A deleted stage takes its menu button with it: the focus goes to the next column's button (or Add stage) once it is gone.
  const afterDelete = useRef<{ deleted: string; next: string | null } | null>(null);
  useEffect(() => {
    const intent = afterDelete.current;
    if (!intent || shown.some((column) => column.stage.id === intent.deleted)) return;
    afterDelete.current = null;
    const target = (intent.next && document.querySelector<HTMLElement>(`[data-stage-menu="${intent.next}"]`)) || document.querySelector<HTMLElement>("[data-add-stage]");
    target?.focus({ preventScroll: true });
  }, [shown]);
  const nameOf = (userId: string) => names[userId] ?? null;
  const taskHref = (taskId: string) => `${taskBase}${taskId}`;
  const active = activeId ? shown.flatMap((column) => column.tasks).find((candidate) => candidate.id === activeId) : undefined;
  const stopDragging = () => {
    setActiveId(null);
    setOverStageId(null);
  };
  const onDragOver = ({ over }: DragOverEvent) => setOverStageId(over ? stageOfDroppable(shown, String(over.id)) : null);
  const onDragEnd = ({ active: dragged, over }: DragEndEvent) => {
    stopDragging();
    if (!over) return;
    const tab = switcher ? resolveTabDrop(pipelines, switcher.pipelineId, shown, String(dragged.id), String(over.id)) : null;
    if (tab) {
      void moveAcross(tab.request, t("announce.destination", { stage: tab.stageName, pipeline: tab.pipelineName }));
      return;
    }
    const request = resolveDrop(shown, String(dragged.id), String(over.id));
    if (request) move(request);
  };
  const messages = crossError === null ? errors : [...errors, crossError];
  const status = (
    <div role="status" aria-label={t("boardUpdates")} aria-busy={crossPending || undefined} className={messages.length > 0 ? "rounded-control bg-danger-soft px-3 py-2 text-sm text-danger-fg" : undefined}>
      <span className="sr-only">{announcement}</span>
      {messages.map((message, i) => (
        <p key={i}>{message}</p>
      ))}
    </div>
  );
  const tabs = switcher && pipelines.length > 0 ? <PipelineTabs data={switcher} droppable={canWrite} dragging={activeId !== null} /> : null;
  const scroller = (children: ReactNode) => (
    <div
      data-testid="board-scroller"
      data-dragging={activeId !== null}
      // Snapping and smooth scrolling fight the drag's own auto-scroll, so both are off while a card is held.
      className={cn("flex gap-4 overflow-x-auto pb-3", activeId !== null ? "snap-none scroll-auto" : "snap-x snap-mandatory scroll-smooth motion-reduce:scroll-auto md:snap-none")}
    >
      {children}
    </div>
  );
  if (!canWrite) {
    return (
      <>
        {status}
        {tabs}
        {scroller(shown.map((column) => <KanbanColumn key={column.stage.id} column={column} nameOf={nameOf} taskHref={taskHref} />))}
      </>
    );
  }
  return (
    <DndContext id="kanban" sensors={sensors} collisionDetection={collideBoard} accessibility={{ announcements: announcementsFor(shown, pipelines, t), screenReaderInstructions: { draggable: t("dragInstructions") } }} onDragStart={({ active }) => setActiveId(String(active.id))} onDragOver={onDragOver} onDragCancel={stopDragging} onDragEnd={onDragEnd}>
      {status}
      {tabs}
      {scroller(
        <>
          {shown.map((column, index) => (
          <DroppableColumn key={column.stage.id} column={column} columns={shown} manage={canManageStages && pipelineId ? { ...manageContextFor(shown.map((candidate) => candidate.stage), index, tasksTruncated), onDeleting: (deleted, next) => (afterDelete.current = { deleted, next }) } : undefined} otherPipelines={pipelines.filter((p) => p.id !== switcher?.pipelineId)} isOver={overStageId === column.stage.id} nameOf={nameOf} taskHref={taskHref} onMove={move} registerHandle={registerHandle} footer={members ? <AddTaskButton stage={column.stage} stages={shown.map((candidate) => candidate.stage)} members={members} /> : undefined} />
          ))}
          {canManageStages && pipelineId ? <AddStageColumn pipelineId={pipelineId} /> : null}
        </>,
      )}
      <DragOverlay>
        {/* A visual copy only: hidden from assistive tech so the card never appears twice. */}
        {active ? (
          <div aria-hidden="true">
            <TaskCard task={active} assigneeName={active.assigneeId ? nameOf(active.assigneeId) : null} lifted />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
