import { Kanban, LayoutDashboard, LogOut } from "lucide-react";
import Link from "next/link";
import { signOutAction } from "@/app/_actions/auth";
import { Avatar } from "@/components/ui/avatar";
import { Button, buttonClasses } from "@/components/ui/button";

const NAV = [
  { href: "/boards", label: "Boards", Icon: Kanban },
  { href: "/dashboard", label: "Dashboard", Icon: LayoutDashboard },
] as const;

/** Sticky, blurred app bar: brand mark, main navigation and the account area. Link and button names are an e2e contract. */
export function AppHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-6">
          <Link href="/boards" className="flex items-center gap-2 font-semibold text-slate-900">
            <span aria-hidden="true" className="inline-flex size-7 items-center justify-center rounded-control bg-brand-gradient text-sm text-white">G</span>
            <span className="sr-only sm:not-sr-only">GestTask</span>
          </Link>
          <nav aria-label="Main" className="flex items-center gap-1">
            {NAV.map(({ href, label, Icon }) => (
              <Link key={href} href={href} className={buttonClasses({ variant: "ghost", size: "sm" })}>
                <Icon aria-hidden="true" className="size-4" />
                {label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <Avatar name="Account" size="sm" />
          <form action={signOutAction}>
            <Button type="submit" variant="secondary" size="sm">
              <LogOut aria-hidden="true" className="size-4" />
              Sign out
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
