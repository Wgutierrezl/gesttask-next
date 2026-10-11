import { Kanban, LayoutDashboard, LogOut } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { signOutAction } from "@/app/_actions/auth";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { NavLink } from "./nav-link";
import { PreferencesMenu } from "./preferences-menu";

/** Sticky, blurred app bar: brand mark, main navigation and sign out. Link and button names are an e2e contract; below `sm` they are icon-only. */
export function AppHeader() {
  const t = useTranslations("shell");
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-2 px-3 sm:gap-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2 sm:gap-6">
          <Link href="/boards" className="flex items-center gap-2 font-semibold text-fg">
            <Logo wordmarkClassName="sr-only sm:not-sr-only" />
          </Link>
          <nav aria-label={t("mainNav")} className="flex items-center gap-1">
            <NavLink href="/boards" icon={<Kanban aria-hidden="true" className="size-4" />}>{t("boards")}</NavLink>
            <NavLink href="/dashboard" icon={<LayoutDashboard aria-hidden="true" className="size-4" />}>{t("dashboard")}</NavLink>
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <PreferencesMenu />
          <form action={signOutAction}>
            <Button type="submit" variant="secondary" size="sm" className="px-2 sm:px-3">
              <LogOut aria-hidden="true" className="size-4" />
              <span className="sr-only sm:not-sr-only">{t("signOut")}</span>
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
