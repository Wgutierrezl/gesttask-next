import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "./cn";

/** A row of links to sibling pages (not an ARIA tablist: each tab is a page of its own, so it is a navigation landmark). */
export function TabNav({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <nav aria-label={label} className={className}>
      <ul className="flex gap-1 overflow-x-auto border-b border-border pb-px">{children}</ul>
    </nav>
  );
}

interface TabLinkProps extends Omit<ComponentProps<typeof Link>, "children"> {
  /** The page the visitor is on: marked with aria-current and styled as selected. */
  current?: boolean;
  /** True while something is dragged over the tab and dropping here would work. */
  highlighted?: boolean;
  children: ReactNode;
}

export function TabLink({ current = false, highlighted = false, className, children, ...rest }: TabLinkProps) {
  return (
    <li>
      <Link
        aria-current={current ? "page" : undefined}
        data-drop-target={highlighted}
        className={cn(
          "inline-flex items-center gap-2 whitespace-nowrap rounded-t-control border-b-2 px-3 py-2 text-sm font-medium transition-colors duration-[var(--duration-fast)] focus-visible:outline-2 focus-visible:outline-ring",
          current ? "border-accent text-brand-link" : "border-transparent text-fg-muted hover:bg-surface-muted hover:text-fg",
          highlighted && "bg-brand-soft ring-2 ring-ring",
          className,
        )}
        {...rest}
      >
        {children}
      </Link>
    </li>
  );
}
