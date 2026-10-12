"use client";

import { MoreHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { crossMoves, neighborMoves, type MoveRequest } from "./move";
import type { ColumnView, PipelineOption } from "./types";

/** Leaves a pointer or touch press to the menu: the card around it would otherwise take it for the start of a drag. */
const keepOffTheDrag = { onPointerDown: (event: { stopPropagation: () => void }) => event.stopPropagation(), onTouchStart: (event: { stopPropagation: () => void }) => event.stopPropagation() };

/** A keyboard and screen-reader friendly alternative to dragging: up, down, or the end of another stage. */
export function MoveMenu({ columns, otherPipelines = [], taskId, title, onMove }: { columns: ColumnView[]; otherPipelines?: PipelineOption[]; taskId: string; title: string; onMove: (request: MoveRequest) => void }) {
  const t = useTranslations("kanban");
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDetailsElement>(null);
  const moves = open ? neighborMoves(columns, taskId) : null;
  const groups = open ? crossMoves(otherPipelines, "", taskId) : [];
  const close = () => {
    root.current?.removeAttribute("open");
    setOpen(false);
  };
  // A popover, not a drawer: a press anywhere else or Escape puts it away.
  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) close();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      root.current?.querySelector("summary")?.focus();
      close();
    };
    document.addEventListener("pointerdown", away, true);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", away, true);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  const choose = (request: MoveRequest) => () => {
    close();
    onMove(request);
  };
  const button = "w-full rounded-control px-2 py-1.5 text-left text-xs text-fg-strong hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-ring";
  return (
    <details ref={root} onToggle={(event) => setOpen(event.currentTarget.open)} className="group/menu absolute right-2 top-2 z-10 text-xs" {...keepOffTheDrag}>
      <summary
        aria-label={t("moveOptions", { title })}
        className="flex size-7 cursor-pointer list-none items-center justify-center rounded-control text-fg-muted opacity-0 transition-opacity hover:bg-surface-muted hover:text-fg focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-ring group-open/menu:opacity-100 group-hover/card:opacity-100 group-focus-within/card:opacity-100 [@media(hover:none)]:opacity-100 [&::-webkit-details-marker]:hidden"
      >
        <MoreHorizontal aria-hidden="true" className="size-4" />
      </summary>
      {moves ? (
        <div className="absolute right-0 top-full z-20 mt-1 flex w-60 flex-col items-stretch gap-0.5 rounded-control border border-border bg-elevated p-1 shadow-pop">
          {moves.up ? <button type="button" className={button} onClick={choose(moves.up)}>{t("moveUp", { title })}</button> : null}
          {moves.down ? <button type="button" className={button} onClick={choose(moves.down)}>{t("moveDown", { title })}</button> : null}
          {moves.toStages.map((stage) => (
            <button key={stage.stageId} type="button" className={button} onClick={choose(stage.request)}>{t("moveToStage", { title, stage: stage.name })}</button>
          ))}
          {groups.map((group) => (
            <div key={group.pipelineId} role="group" aria-label={t("pipelineGroup", { name: group.name })} className="flex flex-col items-stretch gap-0.5">
              {group.stages.map((stage) => (
                <button key={stage.stageId} type="button" className={button} onClick={choose(stage.request)}>{t("moveToPipelineStage", { title, pipeline: group.name, stage: stage.name })}</button>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </details>
  );
}
