import type { ReactNode } from "react";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-border-strong bg-surface px-6 py-12 text-center">
      {icon && <div aria-hidden="true" className="text-fg-subtle">{icon}</div>}
      <p className="text-base font-semibold text-fg">{title}</p>
      {description && <p className="max-w-sm text-sm text-fg-muted">{description}</p>}
      {action}
    </div>
  );
}
