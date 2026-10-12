"use client";

import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { DeleteTaskForm } from "./delete-task-form";
import { EditTaskForm } from "./edit-task-form";
import type { MemberOption, PriorityName } from "./types";

interface TaskActionsProps {
  task: { id: string; title: string; description: string; priority: PriorityName; dueDate: string | null; assigneeId: string | null };
  members: MemberOption[];
}

/** Edit and Delete for a task, each in its own modal. Writers only: the caller does not render this for viewers. */
export function TaskActions({ task, members }: TaskActionsProps) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
        <Pencil aria-hidden="true" className="size-4" />
        Edit
      </Button>
      <Button variant="secondary" size="sm" onClick={() => setDeleting(true)} className="text-danger-fg">
        <Trash2 aria-hidden="true" className="size-4" />
        Delete
      </Button>
      <Dialog title="Edit task" icon={<Pencil className="size-5" />} open={editing} onClose={() => setEditing(false)}>
        <EditTaskForm task={task} members={members} onSuccess={() => setEditing(false)} onCancel={() => setEditing(false)} />
      </Dialog>
      <Dialog title="Delete task" icon={<Trash2 className="size-5" />} open={deleting} onClose={() => setDeleting(false)}>
        <p className="text-sm text-fg-strong">Delete &ldquo;{task.title}&rdquo;? This cannot be undone.</p>
        <DeleteTaskForm taskId={task.id} onCancel={() => setDeleting(false)} />
      </Dialog>
    </>
  );
}
