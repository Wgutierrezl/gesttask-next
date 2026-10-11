import { Kanban, LayoutDashboard, LogOut } from "lucide-react";
import Link from "next/link";
import { signOutAction } from "@/app/_actions/auth";
import { Button } from "@/components/ui/button";
import { NavLink } from "./nav-link";

/** Sticky, blurred app bar: brand mark, main navigation and sign out. Link and button names are an e2e contract; below `sm` they are icon-only. */
export function AppHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-2 px-3 sm:gap-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2 sm:gap-6">
          <Link href="/boards" className="flex items-center gap-2 font-semibold text-slate-900">
            <span aria-hidden="true" className="inline-flex size-7 items-center justify-center rounded-control bg-brand-gradient text-sm text-white">G</span>
            <span className="sr-only sm:not-sr-only">GestTask</span>
          </Link>
          <nav aria-label="Main" className="flex items-center gap-1">
            <NavLink href="/boards" icon={<Kanban aria-hidden="true" className="size-4" />}>Boards</NavLink>
            <NavLink href="/dashboard" icon={<LayoutDashboard aria-hidden="true" className="size-4" />}>Dashboard</NavLink>
          </nav>
        </div>
        <form action={signOutAction}>
          <Button type="submit" variant="secondary" size="sm" className="px-2 sm:px-3">
            <LogOut aria-hidden="true" className="size-4" />
            <span className="sr-only sm:not-sr-only">Sign out</span>
          </Button>
        </form>
      </div>
    </header>
  );
}
