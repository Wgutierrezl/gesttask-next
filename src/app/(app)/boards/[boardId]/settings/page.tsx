import Link from "next/link";
import { notFound } from "next/navigation";
import { loadPage } from "@/app/_shared/load-page";
import { pageWindow, parsePage, slicePage } from "@/app/_shared/pagination";
import { requirePageActor } from "@/app/_shared/require-page-actor";
import { AddMemberForm } from "@/components/boards/add-member-form";
import { ArchiveBoardForm } from "@/components/boards/archive-board-form";
import { DeleteBoardForm } from "@/components/boards/delete-board-form";
import { EditBoardForm } from "@/components/boards/edit-board-form";
import { MemberRow } from "@/components/boards/member-row";
import { PastTheEnd, Pager } from "@/components/boards/pager";
import { getContainer } from "@/infrastructure/container";

export const metadata = { title: "Board settings - GestTask" };

interface SettingsPageProps {
  params: Promise<{ boardId: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
}

export default async function BoardSettingsPage({ params, searchParams }: SettingsPageProps) {
  const actor = await requirePageActor();
  const { boardId } = await params;
  const page = parsePage((await searchParams).page);
  const { board, role } = await loadPage(() => getContainer().useCases.getBoard({ boardId }));
  // Settings are for owners; everyone else gets the same 404 as a board that does not exist.
  if (role !== "owner") notFound();
  const members = slicePage(await loadPage(() => getContainer().useCases.listMemberProfiles({ boardId, ...pageWindow(page) })));
  const settingsPath = `/boards/${board.id}/settings`;
  return (
    <main className="flex flex-col gap-10">
      <header>
        <Link href={`/boards/${board.id}`} className="text-sm underline">
          Back to {board.name}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">Board settings</h1>
      </header>
      <section aria-labelledby="details-heading">
        <h2 id="details-heading" className="mb-3 text-lg font-medium">Details</h2>
        <EditBoardForm board={{ id: board.id, name: board.name, description: board.description }} />
      </section>
      <section aria-labelledby="members-heading" className="flex flex-col gap-4">
        <h2 id="members-heading" className="text-lg font-medium">Members</h2>
        <ul className="divide-y divide-gray-100 rounded border border-gray-200">
          {members.items.map((member) => (
            <MemberRow key={member.userId} boardId={board.id} member={member} isSelf={member.userId === actor.userId} />
          ))}
        </ul>
        {members.items.length === 0 && page > 1 ? <PastTheEnd what="members" href={settingsPath} /> : null}
        <Pager page={page} hasNext={members.hasNext} basePath={settingsPath} />
        <AddMemberForm boardId={board.id} />
      </section>
      <section aria-labelledby="status-heading">
        <h2 id="status-heading" className="mb-3 text-lg font-medium">Status</h2>
        <ArchiveBoardForm board={{ id: board.id, status: board.status }} />
      </section>
      <section aria-labelledby="danger-heading" className="rounded border border-red-200 p-4">
        <h2 id="danger-heading" className="mb-3 text-lg font-medium text-red-800">Delete board</h2>
        <DeleteBoardForm board={{ id: board.id, name: board.name }} />
      </section>
    </main>
  );
}
