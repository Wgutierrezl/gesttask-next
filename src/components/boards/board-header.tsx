import { LayoutDashboard, Settings } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import type { RoleName } from "./role-label";

interface BoardHeaderProps {
  board: { id: string; name: string; description: string; status: "active" | "inactive" };
  role: RoleName;
}

export function BoardHeader({ board, role }: BoardHeaderProps) {
  const t = useTranslations();
  return (
    <PageHeader
      title={board.name}
      description={board.description || undefined}
      actions={
        <>
          {board.status === "inactive" ? <Badge>{t("common.archived")}</Badge> : null}
          <Badge tone="brand">{t(`common.roles.${role}`)}</Badge>
          <LinkButton href={`/boards/${board.id}/dashboard`} variant="secondary" size="sm">
            <LayoutDashboard aria-hidden="true" className="size-4" />
            {t("board.dashboard")}
          </LinkButton>
          {role === "owner" ? (
            <LinkButton href={`/boards/${board.id}/settings`} variant="secondary" size="sm">
              <Settings aria-hidden="true" className="size-4" />
              {t("board.settings")}
            </LinkButton>
          ) : null}
        </>
      }
    />
  );
}
