"use client";

import { MoreHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/components/ui/cn";
import { DeleteStageDialog } from "./delete-stage-dialog";
import type { StageManagement } from "./stage-management";
import type { StageView } from "./types";

const MENU_WIDTH = 224;
const GAP = 4;

interface StageMenuProps {
  stage: StageView;
  count: number;
  manage: StageManagement;
  busy: boolean;
  onRename: () => void;
  onMove: (afterStageId: string) => void;
  onToggleDone: () => void;
  /** Lets the header put the focus back on the trigger (it owns the ref). */
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}

function Item({ children, disabled = false, describedBy, onSelect }: { children: ReactNode; disabled?: boolean; describedBy?: string; onSelect: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      aria-disabled={disabled || undefined}
      aria-describedby={describedBy}
      onClick={() => !disabled && onSelect()}
      className={cn(
        "flex w-full items-center rounded-lg px-3 py-2 text-left text-sm text-fg-strong transition-colors focus-visible:bg-surface-hover focus-visible:outline-2 focus-visible:outline-ring",
        disabled ? "cursor-not-allowed opacity-50" : "hover:bg-surface-hover",
      )}
    >
      {children}
    </button>
  );
}

/**
 * The "⋯" menu of a column header: a button that opens a `menu` of commands. The popup is positioned from the button
 * (fixed, so the board's horizontal scroller never clips it), takes the focus on the first item, moves it with the arrow
 * keys, and closes on Escape (focus back on the button), on a press elsewhere, on scroll and on resize.
 */
export function StageMenu({ stage, count, manage, busy, onRename, onMove, onToggleDone, triggerRef }: StageMenuProps) {
  const t = useTranslations("stages.menu");
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const popup = useRef<HTMLDivElement>(null);
  const hintId = useId();
  const items = () => [...(popup.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];

  const show = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) setPosition({ top: rect.bottom + GAP, left: Math.max(8, rect.right - MENU_WIDTH) });
    setOpen(true);
  };
  const close = (restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };
  useEffect(() => {
    if (!open) return;
    items()[0]?.focus({ preventScroll: true });
    // The popup is placed from the button, so it cannot follow a scroll or a resize: it closes, and the focus stays on the button.
    const dismiss = () => {
      setOpen(false);
      triggerRef.current?.focus({ preventScroll: true });
    };
    const pressedElsewhere = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!popup.current?.contains(target) && !triggerRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("pointerdown", pressedElsewhere);
    window.addEventListener("resize", dismiss);
    window.addEventListener("scroll", dismiss, true);
    return () => {
      document.removeEventListener("pointerdown", pressedElsewhere);
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("scroll", dismiss, true);
    };
    // The refs are stable; only opening and closing should (re)bind the listeners.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    else if (event.key === "Home") go(0);
    else if (event.key === "End") go(list.length - 1);
    else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    } else if (event.key === "Tab") close(false);
  };
  /** `restoreFocus`: the command leaves the stage where it is, so the focus goes back to its button at once. */
  const choose = (action: () => void, restoreFocus = false) => {
    if (busy) return;
    close(restoreFocus);
    action();
  };
  const deleteBlock = stage.isDone ? t("doneCannotDelete") : manage.others.length === 0 ? t("lastStage") : null;
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={t("trigger", { name: stage.name })}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-busy={busy || undefined}
        aria-disabled={busy || undefined}
        data-stage-menu={stage.id}
        onClick={() => {
          if (busy) return;
          if (open) close(false);
          else show();
        }}
        className="rounded-lg p-1.5 text-fg-subtle transition-colors hover:bg-surface hover:text-fg-strong focus-visible:outline-2 focus-visible:outline-ring"
      >
        <MoreHorizontal aria-hidden="true" className="size-4" />
      </button>
      {open ? (
        <div ref={popup} style={{ top: position.top, left: position.left, width: MENU_WIDTH }} className="fixed z-30 animate-pop-in rounded-xl border border-elevated-edge bg-elevated p-1 text-fg shadow-dialog motion-reduce:animate-none">
          <div role="menu" aria-label={t("trigger", { name: stage.name })} onKeyDown={onKeyDown} className="flex flex-col">
            <Item disabled={busy} onSelect={() => choose(onRename)}>{t("rename")}</Item>
            <Item disabled={busy || manage.afterWhenLeft === null} onSelect={() => choose(() => onMove(manage.afterWhenLeft ?? ""), true)}>{t("moveLeft")}</Item>
            <Item disabled={busy || manage.afterWhenRight === null} onSelect={() => choose(() => onMove(manage.afterWhenRight ?? ""), true)}>{t("moveRight")}</Item>
            <Item disabled={busy} onSelect={() => choose(onToggleDone, true)}>{stage.isDone ? t("unmarkDone") : t("markDone")}</Item>
            <Item disabled={busy || deleteBlock !== null} describedBy={deleteBlock ? hintId : undefined} onSelect={() => choose(() => setDeleting(true))}>{t("delete")}</Item>
          </div>
          {deleteBlock ? <p id={hintId} className="px-3 pt-1 pb-2 text-xs text-fg-muted">{deleteBlock}</p> : null}
        </div>
      ) : null}
      <DeleteStageDialog
        stage={stage}
        manage={manage}
        count={count}
        open={deleting}
        onClose={() => {
          setDeleting(false);
          triggerRef.current?.focus();
        }}
      />
    </>
  );
}
