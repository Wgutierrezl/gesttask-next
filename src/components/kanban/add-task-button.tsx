"use client";

import { ListPlus, Plus } from "lucide-react";
import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { CreateTaskForm } from "./create-task-form";
import type { MemberOption, StageView } from "./types";

interface AddTaskButtonProps {
  /** The column this button sits in: the new task's stage starts here. */
  stage: Pick<StageView, "id" | "name">;
  stages: Pick<StageView, "id" | "name">[];
  members: MemberOption[];
}

/** The dashed button under a column's cards. It opens the Create task modal with this column's stage preselected. */
export function AddTaskButton({ stage, stages, members }: AddTaskButtonProps) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <>
      <button
        type="button"
        aria-label={`Add task to ${stage.name}`}
        onClick={() => setOpen(true)}
        className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border-strong px-3 py-2 text-sm font-medium text-fg-muted transition-colors hover:border-ring hover:bg-brand-soft hover:text-brand-link focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
      >
        <Plus aria-hidden="true" className="size-4" />
        Add task
      </button>
      <Dialog title="New task" icon={<ListPlus className="size-5" />} open={open} onClose={close}>
        <CreateTaskForm stages={stages} members={members} defaultStageId={stage.id} onSuccess={close} onCancel={close} />
      </Dialog>
    </>
  );
}
