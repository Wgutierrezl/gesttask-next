"use client";

import { useState } from "react";
import { neighborMoves, type MoveRequest } from "./move";
import type { ColumnView } from "./types";

/** A keyboard and screen-reader friendly alternative to dragging: up, down, or the end of another stage. */
export function MoveMenu({ columns, taskId, title, onMove }: { columns: ColumnView[]; taskId: string; title: string; onMove: (request: MoveRequest) => void }) {
  const [open, setOpen] = useState(false);
  const moves = open ? neighborMoves(columns, taskId) : null;
  const choose = (request: MoveRequest) => (event: { currentTarget: HTMLElement }) => {
    event.currentTarget.closest("details")?.removeAttribute("open");
    setOpen(false);
    onMove(request);
  };
  const button = "rounded-control border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-brand-600";
  return (
    <details onToggle={(event) => setOpen(event.currentTarget.open)} className="text-xs">
      <summary aria-label={`Move options for ${title}`} className="inline-flex h-7 cursor-pointer items-center rounded-control border border-slate-300 bg-white px-2 text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-brand-600">Move</summary>
      {moves ? (
        <div className="mt-1 flex flex-col items-start gap-1">
          {moves.up ? <button type="button" className={button} onClick={choose(moves.up)}>{`Move ${title} up`}</button> : null}
          {moves.down ? <button type="button" className={button} onClick={choose(moves.down)}>{`Move ${title} down`}</button> : null}
          {moves.toStages.map((stage) => (
            <button key={stage.stageId} type="button" className={button} onClick={choose(stage.request)}>{`Move ${title} to ${stage.name}`}</button>
          ))}
        </div>
      ) : null}
    </details>
  );
}
