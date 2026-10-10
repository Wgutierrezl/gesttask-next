import { requirePageActor } from "@/app/_shared/require-page-actor";
import { loadPage } from "@/app/_shared/load-page";
import { pageWindow, parsePage, slicePage } from "@/app/_shared/pagination";
import { BoardCard } from "@/components/boards/board-card";
import { CreateBoardForm } from "@/components/boards/create-board-form";
import { Pager } from "@/components/boards/pager";
import { getContainer } from "@/infrastructure/container";

export const metadata = { title: "Boards - GestTask" };

export default async function BoardsPage({ searchParams }: { searchParams: Promise<{ page?: string | string[] }> }) {
  await requirePageActor();
  const page = parsePage((await searchParams).page);
  const { items, hasNext, roles } = await loadPage(async () => {
    const { listMyBoards, listMyMemberships } = getContainer().useCases;
    const [rows, memberships] = await Promise.all([listMyBoards(pageWindow(page)), listMyMemberships(undefined)]);
    return { ...slicePage(rows), roles: new Map(memberships.map((m) => [m.boardId, m.role])) };
  });
  return (
    <main className="flex flex-col gap-8">
      <section aria-labelledby="boards-heading">
        <h1 id="boards-heading" className="text-xl font-semibold">Your boards</h1>
        {items.length === 0 ? (
          <p className="mt-2 text-sm text-gray-600">You have no boards yet. Create your first one below.</p>
        ) : (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {items.map((board) => (
              <BoardCard key={board.id} board={board} role={roles.get(board.id)} />
            ))}
          </ul>
        )}
        <Pager page={page} hasNext={hasNext} basePath="/boards" />
      </section>
      <section aria-labelledby="create-heading" className="max-w-md">
        <h2 id="create-heading" className="mb-3 text-lg font-medium">Create a board</h2>
        <CreateBoardForm />
      </section>
    </main>
  );
}
