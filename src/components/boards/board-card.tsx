import { useTranslations } from "next-intl";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { RoleName } from "./role-label";

/** One board in the list: name, description, the caller's role and whether it is archived. */
interface BoardSummary {
  id: string;
  name: string;
  description: string;
  status: "active" | "inactive";
}

export function BoardCard({ board, role }: { board: BoardSummary; role: RoleName | undefined }) {
  const t = useTranslations("common");
  return (
    <li>
      <Card interactive className="h-full">
        <Link href={`/boards/${board.id}`} className="flex h-full flex-col gap-2 rounded-card p-5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          <span className="flex items-start justify-between gap-2">
            <span className="font-semibold text-fg">{board.name}</span>
            <span className="flex shrink-0 gap-1.5">
              {board.status === "inactive" ? <Badge>{t("archived")}</Badge> : null}
              {role ? <Badge tone="brand">{t(`roles.${role}`)}</Badge> : null}
            </span>
          </span>
          {board.description ? <span className="line-clamp-2 text-sm text-fg-muted">{board.description}</span> : null}
        </Link>
      </Card>
    </li>
  );
}
