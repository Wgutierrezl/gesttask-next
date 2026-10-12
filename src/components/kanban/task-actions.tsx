"use client";

import { Pencil, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { DeleteTaskForm } from "./delete-task-form";
import { EditTaskForm } from "./edit-task-form";
import type { MemberOption, PriorityName } from "./types";

const ICON_BUTTON = "rounded-lg p-2 transition-colors focus-visible:outline-2 focus-visible:outline-ring";

interface TaskActionsProps {
  task: { id: string; title: string; description: string; priority: PriorityName; dueDate: string | null; assigneeId: string | null };
  members: MemberOption[];
  /** Icon buttons (v1's modal header) instead of labelled ones; the names stay as accessible names and tooltips. */
  iconOnly?: boolean;
}

/** Edit and Delete for a task, each in its own modal. Writers only: the caller does not render this for viewers. */
export function TaskActions({ task, members, iconOnly = false }: TaskActionsProps) {
  const t = useTranslations("task");
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  return (
    <>
      {iconOnly ? (
        <>
          <button type="button" aria-label={t("edit")} title={t("edit")} onClick={() => setEditing(true)} className={ICON_BUTTON + " text-icon-fg hover:bg-brand-soft"}>
            <Pencil aria-hidden="true" className="size-5" />
          </button>
          <button type="button" aria-label={t("delete")} title={t("delete")} onClick={() => setDeleting(true)} className={ICON_BUTTON + " text-danger-fg hover:bg-danger-soft"}>
            <Trash2 aria-hidden="true" className="size-5" />
          </button>
        </>
      ) : (
        <>
          <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
            <Pencil aria-hidden="true" className="size-4" />
            {t("edit")}
          </Button>
          <Button variant="danger-secondary" size="sm" onClick={() => setDeleting(true)}>
            <Trash2 aria-hidden="true" className="size-4" />
            {t("delete")}
          </Button>
        </>
      )}
      <Dialog title={t("editTitle")} icon={<Pencil className="size-5" />} open={editing} onClose={() => setEditing(false)}>
        <EditTaskForm task={task} members={members} onSuccess={() => setEditing(false)} onCancel={() => setEditing(false)} />
      </Dialog>
      <Dialog title={t("deleteTitle")} icon={<Trash2 className="size-5" />} open={deleting} onClose={() => setDeleting(false)}>
        <p className="text-sm text-fg-strong">{t("deletePrompt", { title: task.title })}</p>
        <DeleteTaskForm taskId={task.id} onCancel={() => setDeleting(false)} />
      </Dialog>
    </>
  );
}
