"use client";

import { FolderKanban, Plus, Workflow } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { CreateBoardForm } from "./create-board-form";
import { CreatePipelineForm } from "./create-pipeline-form";

/** A button that opens `children` in a modal; `children` is a function so the form can close it on success. */
function DialogButton({ label, title, icon, children }: { label: string; title: string; icon: ReactNode; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus aria-hidden="true" className="size-4" />
        {label}
      </Button>
      <Dialog title={title} icon={icon} open={open} onClose={close}>{children(close)}</Dialog>
    </>
  );
}

/** No `onSuccess` here: `createBoardAction` redirects to the new board on success, which unmounts this page. */
export function CreateBoardDialog() {
  const t = useTranslations("boards");
  return <DialogButton label={t("create")} title={t("newBoard")} icon={<FolderKanban className="size-5" />}>{(close) => <CreateBoardForm onCancel={close} />}</DialogButton>;
}

export function CreatePipelineDialog({ boardId }: { boardId: string }) {
  const t = useTranslations("pipeline");
  return <DialogButton label={t("create")} title={t("newPipeline")} icon={<Workflow className="size-5" />}>{(close) => <CreatePipelineForm boardId={boardId} onSuccess={close} onCancel={close} />}</DialogButton>;
}
