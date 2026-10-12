"use client";

import { MoreHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { crossMoves, neighborMoves, type MoveRequest } from "./move";
import type { ColumnView, PipelineOption } from "./types";

const WIDTH = 240;
const GAP = 4;
const MARGIN = 8;

/** Leaves a pointer or touch press to the menu: the card around it would otherwise take it for the start of a drag. */
const keepOffTheDrag = { onPointerDown: (event: { stopPropagation: () => void }) => event.stopPropagation(), onTouchStart: (event: { stopPropagation: () => void }) => event.stopPropagation() };

type Place = { left: number; top?: number; bottom?: number };

/** Below the button when the popup fits there, above it otherwise; right-aligned to the button, kept inside the window. */
function placeFor(button: DOMRect, height: number): Place {
  const left = Math.max(MARGIN, Math.min(button.right - WIDTH, window.innerWidth - WIDTH - MARGIN));
  const fitsBelow = button.bottom + GAP + height <= window.innerHeight - MARGIN;
  return fitsBelow ? { left, top: button.bottom + GAP } : { left, bottom: window.innerHeight - button.top + GAP };
}

/**
 * A keyboard and screen-reader friendly alternative to dragging: up, down, or the end of another stage. The popup is
 * rendered in the document body and positioned from the button (fixed), so neither the board's scroller nor a card's
 * transform can clip or move it; it closes on Escape (focus back on the button), on a press elsewhere, on scroll and on resize.
 */
export function MoveMenu({ columns, otherPipelines = [], taskId, title, onMove }: { columns: ColumnView[]; otherPipelines?: PipelineOption[]; taskId: string; title: string; onMove: (request: MoveRequest) => void }) {
  const t = useTranslations("kanban");
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<Place | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const moves = open ? neighborMoves(columns, taskId) : null;
  const groups = open ? crossMoves(otherPipelines, "", taskId) : [];
  const items = () => [...(popup.current?.querySelectorAll<HTMLElement>("button") ?? [])];
  const close = (restoreFocus: boolean) => {
    setOpen(false);
    setPlace(null);
    if (restoreFocus) trigger.current?.focus({ preventScroll: true });
  };
  // Measured once the popup exists: it is hidden until it knows whether it goes below or above the button.
  useLayoutEffect(() => {
    if (open && popup.current && trigger.current) setPlace(placeFor(trigger.current.getBoundingClientRect(), popup.current.offsetHeight));
  }, [open]);
  useEffect(() => {
    if (!open) return;
    items()[0]?.focus({ preventScroll: true });
    const dismiss = () => close(false);
    const away = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!popup.current?.contains(target) && !trigger.current?.contains(target)) close(false);
    };
    document.addEventListener("pointerdown", away, true);
    window.addEventListener("resize", dismiss);
    window.addEventListener("scroll", dismiss, true);
    return () => {
      document.removeEventListener("pointerdown", away, true);
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("scroll", dismiss, true);
    };
  }, [open]);
  const onKeyDown = (event: KeyboardEvent) => {
    const list = items();
    const at = list.indexOf(document.activeElement as HTMLElement);
    const go = (index: number) => {
      event.preventDefault();
      list[(index + list.length) % list.length]?.focus();
    };
    if (event.key === "ArrowDown") go(at + 1);
    else if (event.key === "ArrowUp") go(at - 1);
    else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    } else if (event.key === "Tab") close(false);
  };
  const choose = (request: MoveRequest) => () => {
    close(false);
    onMove(request);
  };
  const button = "w-full rounded-control px-2 py-1.5 text-left text-xs text-fg-strong hover:bg-surface-muted focus-visible:bg-surface-muted focus-visible:outline-2 focus-visible:outline-ring";
  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-label={t("moveOptions", { title })}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => (open ? close(false) : setOpen(true))}
        {...keepOffTheDrag}
        className="absolute right-2 top-2 z-10 flex size-7 cursor-pointer items-center justify-center rounded-control text-fg-muted opacity-0 transition-opacity hover:bg-surface-muted hover:text-fg focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-ring aria-expanded:opacity-100 group-hover/card:opacity-100 group-focus-within/card:opacity-100 [@media(hover:none)]:opacity-100"
      >
        <MoreHorizontal aria-hidden="true" className="size-4" />
      </button>
      {moves
        ? createPortal(
            <div
              ref={popup}
              data-testid="move-popover"
              onKeyDown={onKeyDown}
              {...keepOffTheDrag}
              style={{ width: WIDTH, left: place?.left ?? 0, top: place?.top, bottom: place?.bottom, visibility: place ? "visible" : "hidden" }}
              className="fixed z-30 flex flex-col items-stretch gap-0.5 rounded-control border border-border bg-elevated p-1 text-xs shadow-pop"
            >
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
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
