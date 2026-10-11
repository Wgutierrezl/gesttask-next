import Link from "next/link";
import { ROLE_LABEL, type RoleName } from "./role-label";

interface BoardHeaderProps {
  board: { id: string; name: string; description: string; status: "active" | "inactive" };
  role: RoleName;
}

export function BoardHeader({ board, role }: BoardHeaderProps) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold">{board.name}</h1>
        {board.description ? <p className="mt-1 text-sm text-gray-600">{board.description}</p> : null}
      </div>
      <div className="flex items-center gap-3 text-xs">
        {board.status === "inactive" ? <span className="rounded bg-gray-200 px-2 py-0.5">Archived</span> : null}
        <span className="rounded bg-blue-100 px-2 py-0.5">{ROLE_LABEL[role]}</span>
        <Link href={`/boards/${board.id}/dashboard`} className="text-sm underline">
          Dashboard
        </Link>
        {role === "owner" ? (
          <Link href={`/boards/${board.id}/settings`} className="text-sm underline">
            Settings
          </Link>
        ) : null}
      </div>
    </header>
  );
}
