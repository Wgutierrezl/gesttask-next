import { ArrowLeft, LayoutDashboard, LayoutGrid, Settings } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import type { RoleName } from "./role-label";

interface BoardHeaderProps {
  board: { id: string; name: string; description: string; status: "active" | "inactive" };
  role: RoleName;
  /** Controls placed before the links, e.g. the members dialog. */
  children?: ReactNode;
}

/**
 * The top of a board page like v1's: a way back, the board (gradient icon, name, description) and its actions on the right.
 * The back link reads "Back" and is named "Back to boards" for assistive tech, so the visible word is part of its name.
 */
export function BoardHeader({ board, role, children }: BoardHeaderProps) {
  const t = useTranslations();
  return (
    <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b border-border pb-4">
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-3">
        <Link href="/boards" aria-label={t("board.header.back")} className="flex items-center gap-2 rounded-xl px-3 py-2 text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-ring">
          <ArrowLeft aria-hidden="true" className="size-5" />
          <span className="text-sm">{t("kanban.page.backShort")}</span>
        </Link>
        <div aria-hidden="true" className="hidden h-8 w-px bg-border sm:block" />
        <div className="flex min-w-0 items-center gap-3">
          <div aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-gradient shadow-brand">
            <LayoutGrid className="size-6 text-white" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="min-w-0 truncate text-lg font-medium text-fg">{board.name}</h1>
              {board.status === "inactive" ? <Badge>{t("common.archived")}</Badge> : null}
              <Badge tone="brand">{t(`common.roles.${role}`)}</Badge>
            </div>
            {board.description ? <p className="line-clamp-1 text-xs text-fg-subtle">{board.description}</p> : null}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {children}
        <LinkButton href={`/boards/${board.id}/dashboard`} variant="secondary" size="sm" className="rounded-xl">
          <LayoutDashboard aria-hidden="true" className="size-4" />
          {t("board.dashboard")}
        </LinkButton>
        {role === "owner" ? (
          <LinkButton href={`/boards/${board.id}/settings`} variant="secondary" size="sm" className="rounded-xl">
            <Settings aria-hidden="true" className="size-4" />
            {t("board.settings")}
          </LinkButton>
        ) : null}
      </div>
    </header>
  );
}
