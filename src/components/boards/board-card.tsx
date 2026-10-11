import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ROLE_LABEL, type RoleName } from "./role-label";

/** One board in the list: name, description, the caller's role and whether it is archived. */
interface BoardSummary {
  id: string;
  name: string;
  description: string;
  status: "active" | "inactive";
}

export function BoardCard({ board, role }: { board: BoardSummary; role: RoleName | undefined }) {
  return (
    <li>
      <Card interactive className="h-full">
        <Link href={`/boards/${board.id}`} className="flex h-full flex-col gap-2 rounded-card p-5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600">
          <span className="flex items-start justify-between gap-2">
            <span className="font-semibold text-slate-900">{board.name}</span>
            <span className="flex shrink-0 gap-1.5">
              {board.status === "inactive" ? <Badge>Archived</Badge> : null}
              {role ? <Badge tone="brand">{ROLE_LABEL[role]}</Badge> : null}
            </span>
          </span>
          {board.description ? <span className="line-clamp-2 text-sm text-slate-600">{board.description}</span> : null}
        </Link>
      </Card>
    </li>
  );
}
