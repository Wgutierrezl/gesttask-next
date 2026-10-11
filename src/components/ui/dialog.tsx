"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { Button } from "./button";

interface DialogProps {
  title: string;
  open: boolean;
  /**
   * Called once when the user dismisses the dialog (Close button, Esc or backdrop).
   * The parent MUST set `open` to false in response, otherwise the dialog cannot be reopened.
   */
  onClose: () => void;
  children: ReactNode;
}

/** Modal on the native `<dialog>`: the browser provides the focus trap, Esc and focus return. */
export function Dialog({ title, open, onClose, children }: DialogProps) {
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
      className="m-auto max-h-[85vh] w-full max-w-md overflow-y-auto rounded-card bg-white p-0 shadow-pop backdrop:bg-slate-900/40 open:animate-pop-in"
    >
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <h2 id={titleId} className="text-base font-semibold text-slate-900">{title}</h2>
        <Button variant="ghost" size="icon" aria-label="Close" onClick={() => ref.current?.close()}>
          <X aria-hidden="true" className="size-4" />
        </Button>
      </div>
      {open && <div className="px-5 py-4">{children}</div>}
    </dialog>
  );
}
