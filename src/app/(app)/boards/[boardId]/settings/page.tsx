import Link from "next/link";
import { notFound } from "next/navigation";
import { loadPage } from "@/app/_shared/load-page";
import { requirePageActor } from "@/app/_shared/require-page-actor";
import { ArchiveBoardForm } from "@/components/boards/archive-board-form";
import { DeleteBoardForm } from "@/components/boards/delete-board-form";
import { EditBoardForm } from "@/components/boards/edit-board-form";
import { getContainer } from "@/infrastructure/container";

export const metadata = { title: "Board settings - GestTask" };

export default async function BoardSettingsPage({ params }: { params: Promise<{ boardId: string }> }) {
  await requirePageActor();
  const { boardId } = await params;
  const { board, role } = await loadPage(() => getContainer().useCases.getBoard({ boardId }));
  // Settings are for owners; everyone else gets the same 404 as a board that does not exist.
  if (role !== "owner") notFound();
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
