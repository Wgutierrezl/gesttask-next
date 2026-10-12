import type { ReactNode } from "react";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

/** v1's empty state: a soft rounded icon box, a title and one line of help, centred in open space. */
export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-20 text-center">
      {icon && <div aria-hidden="true" className="mb-4 flex size-20 items-center justify-center rounded-2xl bg-surface-muted text-fg-subtle">{icon}</div>}
      <h2 className="text-xl text-fg">{title}</h2>
      {description && <p className="max-w-md text-fg-muted">{description}</p>}
      {action}
    </div>
  );
}
