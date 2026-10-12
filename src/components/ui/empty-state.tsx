import type { ReactNode } from "react";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  /** Heading level: h2 by default; h3 inside a section that already has its own h2. */
  as?: "h2" | "h3";
}

/** v1's empty state: a soft rounded icon box, a title and one line of help, centred in open space. */
export function EmptyState({ icon, title, description, action, as: Heading = "h2" }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-20 text-center">
      {icon && <div aria-hidden="true" className="mb-4 flex size-20 items-center justify-center rounded-2xl bg-surface-muted text-fg-subtle">{icon}</div>}
      <Heading className="text-xl text-fg">{title}</Heading>
      {description && <p className="max-w-md text-fg-muted">{description}</p>}
      {action}
    </div>
  );
}
