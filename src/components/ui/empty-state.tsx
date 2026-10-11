import type { ReactNode } from "react";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
      {icon && <div aria-hidden="true" className="text-slate-500">{icon}</div>}
      <p className="text-base font-semibold text-slate-900">{title}</p>
      {description && <p className="max-w-sm text-sm text-slate-600">{description}</p>}
      {action}
    </div>
  );
}
