"use client";

import { Plus } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { CreateBoardForm } from "./create-board-form";
import { CreatePipelineForm } from "./create-pipeline-form";

/** A button that opens `children` in a modal; `children` is a function so the form can close it on success. */
function DialogButton({ label, title, children }: { label: string; title: string; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus aria-hidden="true" className="size-4" />
        {label}
      </Button>
      <Dialog title={title} open={open} onClose={close}>{children(close)}</Dialog>
    </>
  );
}

/** No `onSuccess` here: `createBoardAction` redirects to the new board on success, which unmounts this page. */
export function CreateBoardDialog() {
  return <DialogButton label="Create board" title="New board">{() => <CreateBoardForm />}</DialogButton>;
}

export function CreatePipelineDialog({ boardId }: { boardId: string }) {
  return <DialogButton label="Create pipeline" title="New pipeline">{(close) => <CreatePipelineForm boardId={boardId} onSuccess={close} />}</DialogButton>;
}
