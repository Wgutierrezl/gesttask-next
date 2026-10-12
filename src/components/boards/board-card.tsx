import { LayoutGrid } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { LocalDay } from "@/components/kanban/local-time";
import type { RoleName } from "./role-label";

/** One board in the list: name, description, whether it is archived, the caller's role and when it was created. */
interface BoardSummary {
  id: string;
  name: string;
  description: string;
  status: "active" | "inactive";
  createdAt: Date;
}

/** v1's status pill: green while the board is in use, neutral once archived. */
const STATUS = {
  active: "border-success-edge bg-success-soft text-success-fg",
  inactive: "border-border bg-surface-muted text-fg-muted",
} as const;

export function BoardCard({ board, role }: { board: BoardSummary; role: RoleName | undefined }) {
  const t = useTranslations("common");
  const created = board.createdAt.toISOString();
  return (
    <li>
      <Link
        href={`/boards/${board.id}`}
        className="group flex h-full flex-col rounded-2xl border border-border bg-surface p-6 transition duration-[var(--duration-base)] ease-[var(--ease-out-soft)] hover:border-border-hover hover:shadow-pop focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <span className="mb-4 flex items-start justify-between gap-2">
          <span aria-hidden="true" className="flex size-12 items-center justify-center rounded-xl bg-linear-to-br from-icon-from to-icon-to text-icon-fg transition-all">
            <LayoutGrid className="size-6" />
          </span>
          <span className={`rounded-lg border px-2.5 py-1 text-xs ${STATUS[board.status]}`}>{board.status === "active" ? t("active") : t("archived")}</span>
        </span>
        <h3 className="mb-2 line-clamp-2 text-lg text-fg transition-colors group-hover:text-brand-link">{board.name}</h3>
        <span className="mb-4 line-clamp-2 min-h-10 text-sm text-fg-muted">{board.description}</span>
        <span className="mt-auto flex items-center justify-between gap-2 border-t border-border-subtle pt-4 text-xs text-fg-subtle">
          <span>{role ? t(`roles.${role}`) : null}</span>
          <LocalDay iso={created} />
        </span>
      </Link>
    </li>
  );
}
