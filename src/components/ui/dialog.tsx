"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "./cn";

const SIZES = { md: "max-w-lg", lg: "max-w-2xl" } as const;

interface DialogProps {
  title: string;
  open: boolean;
  /**
   * Called once when the user dismisses the dialog (Close button, Esc or backdrop).
   * The parent MUST set `open` to false in response, otherwise the dialog cannot be reopened.
   */
  onClose: () => void;
  children: ReactNode;
  size?: keyof typeof SIZES;
  /** A decorative glyph shown in a tinted box before the title. */
  icon?: ReactNode;
  /** A line under the title, e.g. where a task lives. */
  subtitle?: ReactNode;
  /** Extra controls in the header, before the Close button. */
  actions?: ReactNode;
}

/** Modal on the native `<dialog>`: the browser provides the focus trap, Esc and focus return. */
export function Dialog({ title, open, onClose, children, size = "md", icon, subtitle, actions }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const pressedOnBackdrop = useRef(false);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      // The native close event is the single source of onClose; closing driven by `open=false` is not reported back.
      onClose={() => {
        if (open) onClose();
      }}
      onPointerDown={(event) => {
        pressedOnBackdrop.current = event.target === ref.current;
      }}
      onClick={(event) => {
        // Only a press AND a release on the backdrop close it, so a text-selection drag that ends outside does not.
        if (pressedOnBackdrop.current && event.target === ref.current) ref.current?.close();
        pressedOnBackdrop.current = false;
      }}
      className={cn(
        "m-auto max-h-[90vh] w-full overflow-hidden rounded-2xl bg-white p-0 shadow-2xl open:flex open:flex-col open:animate-modal-in",
        "backdrop:bg-black/60 backdrop:backdrop-blur-sm backdrop:animate-fade-in",
        SIZES[size],
      )}
    >
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 p-6">
        <div className="flex min-w-0 items-center gap-3">
          {icon ? (
            <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-blue-50 to-indigo-50 text-blue-600">
              {icon}
            </span>
          ) : null}
          <div className="min-w-0">
            <h2 id={titleId} className="break-words text-xl font-semibold text-slate-900">{title}</h2>
            {subtitle ? <p className="text-sm text-slate-600">{subtitle}</p> : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {actions}
          <button
            type="button"
            aria-label="Close"
            onClick={() => ref.current?.close()}
            className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-brand-600"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </div>
      </div>
      {open && <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-6">{children}</div>}
    </dialog>
  );
}
