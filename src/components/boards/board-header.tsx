import { LayoutDashboard, Settings } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { ROLE_LABEL, type RoleName } from "./role-label";

interface BoardHeaderProps {
  board: { id: string; name: string; description: string; status: "active" | "inactive" };
  role: RoleName;
}

export function BoardHeader({ board, role }: BoardHeaderProps) {
  return (
    <PageHeader
      title={board.name}
      description={board.description || undefined}
      actions={
        <>
          {board.status === "inactive" ? <Badge>Archived</Badge> : null}
          <Badge tone="brand">{ROLE_LABEL[role]}</Badge>
          <LinkButton href={`/boards/${board.id}/dashboard`} variant="secondary" size="sm">
            <LayoutDashboard aria-hidden="true" className="size-4" />
            Dashboard
          </LinkButton>
          {role === "owner" ? (
            <LinkButton href={`/boards/${board.id}/settings`} variant="secondary" size="sm">
              <Settings aria-hidden="true" className="size-4" />
              Settings
            </LinkButton>
          ) : null}
        </>
      }
    />
  );
}
