"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { Button } from "./button";

interface DialogProps {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

/** Modal on the native `<dialog>`: the browser provides the focus trap, Esc and focus return. */
export function Dialog({ title, open, onClose, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
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
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      className="m-auto w-full max-w-md rounded-card bg-white p-0 shadow-pop backdrop:bg-slate-900/40 open:animate-pop-in"
    >
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <h2 id={titleId} className="text-base font-semibold text-slate-900">{title}</h2>
        <Button variant="ghost" size="icon" aria-label="Close" onClick={onClose}>
          <X aria-hidden="true" className="size-4" />
        </Button>
      </div>
      <div className="px-5 py-4">{children}</div>
    </dialog>
  );
}
