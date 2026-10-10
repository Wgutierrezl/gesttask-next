import Link from "next/link";
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
    <li className="rounded border border-gray-200 p-4 hover:border-gray-400">
      <Link href={`/boards/${board.id}`} className="block">
        <span className="flex items-center justify-between gap-2">
          <span className="font-medium">{board.name}</span>
          <span className="flex gap-2 text-xs">
            {board.status === "inactive" ? <span className="rounded bg-gray-200 px-2 py-0.5">Archived</span> : null}
            {role ? <span className="rounded bg-blue-100 px-2 py-0.5">{ROLE_LABEL[role]}</span> : null}
          </span>
        </span>
        {board.description ? <span className="mt-1 block text-sm text-gray-600">{board.description}</span> : null}
      </Link>
    </li>
  );
}
