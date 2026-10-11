import { LayoutGrid } from "lucide-react";
import Link from "next/link";
import { requirePageActor } from "@/app/_shared/require-page-actor";
import { loadPage } from "@/app/_shared/load-page";
import { pageWindow, parsePage, slicePage } from "@/app/_shared/pagination";
import { BoardCard } from "@/components/boards/board-card";
import { CreateBoardDialog } from "@/components/boards/create-dialogs";
import { Pager } from "@/components/boards/pager";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { getContainer } from "@/infrastructure/container";

export const metadata = { title: "Boards" };

export default async function BoardsPage({ searchParams }: { searchParams: Promise<{ page?: string | string[] }> }) {
  await requirePageActor();
  const page = parsePage((await searchParams).page);
  const { items, hasNext, roles } = await loadPage(async () => {
    const { listMyBoards, listMyMemberships } = getContainer().useCases;
    const shown = slicePage(await listMyBoards(pageWindow(page)));
    // Roles only for the boards on this page: the caller may belong to many more.
    const memberships = shown.items.length > 0 ? await listMyMemberships({ boardIds: shown.items.map((b) => b.id) }) : [];
    return { ...shown, roles: new Map(memberships.map((m) => [m.boardId, m.role])) };
  });
  return (
    <main>
      <PageHeader title="Your boards" description="Everything you own or collaborate on." actions={<CreateBoardDialog />} />
      {items.length === 0 ? (
        page > 1 ? (
          <p className="text-sm text-slate-600">
            No boards on this page. <Link href="/boards" className="text-brand-700 underline">Go to the first page</Link>
          </p>
        ) : (
          <EmptyState icon={<LayoutGrid className="size-8" />} title="You have no boards yet" description="Create your first one to start organising work." />
        )
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((board) => (
            <BoardCard key={board.id} board={board} role={roles.get(board.id)} />
          ))}
        </ul>
      )}
      <Pager page={page} hasNext={hasNext} basePath="/boards" />
    </main>
  );
}
