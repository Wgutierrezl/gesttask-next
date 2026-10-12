"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { buttonClasses } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";

/** Main-navigation link: marks the section it belongs to with aria-current. Below `sm` only its icon shows; the label stays its accessible name. */
export function NavLink({ href, icon, children }: { href: string; icon: ReactNode; children: ReactNode }) {
  const pathname = usePathname();
  const current = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={cn(buttonClasses({ variant: "ghost", size: "sm" }), "px-2 sm:px-3", current && "bg-brand-soft text-brand-link")}
    >
      {icon}
      <span className="sr-only sm:not-sr-only">{children}</span>
    </Link>
  );
}
