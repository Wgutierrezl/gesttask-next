import { LayoutGrid } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { requirePageActor } from "@/app/_shared/require-page-actor";
import { loadPage } from "@/app/_shared/load-page";
import { pageWindow, parsePage, slicePage } from "@/app/_shared/pagination";
import { BoardCard } from "@/components/boards/board-card";
import { CreateBoardDialog } from "@/components/boards/create-dialogs";
import { PastTheEnd, Pager } from "@/components/boards/pager";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHero } from "@/components/ui/page-hero";
import { getContainer } from "@/infrastructure/container";

export async function generateMetadata() {
  return { title: (await getTranslations("meta"))("boards") };
}

export default async function BoardsPage({ searchParams }: { searchParams: Promise<{ page?: string | string[] }> }) {
  await requirePageActor();
  const t = await getTranslations("boards");
  const page = parsePage((await searchParams).page);
  const { items, hasNext, roles } = await loadPage(async () => {
    const { listMyBoards, listMyMemberships } = getContainer().useCases;
    const shown = slicePage(await listMyBoards(pageWindow(page)));
    // Roles only for the boards on this page: the caller may belong to many more.
    const memberships = shown.items.length > 0 ? await listMyMemberships({ boardIds: shown.items.map((b) => b.id) }) : [];
    return { ...shown, roles: new Map(memberships.map((m) => [m.boardId, m.role])) };
  });
  return (
    <main className="flex flex-col gap-10">
      <PageHero
        title={t("title")}
        description={t("description")}
        meta={items.length > 0 ? { icon: <LayoutGrid />, text: t(page === 1 && !hasNext ? "activeCount" : "activeCountPage", { count: items.filter((board) => board.status === "active").length }) } : undefined}
        actions={<CreateBoardDialog />}
      />
      {items.length === 0 ? (
        page > 1 ? (
          <PastTheEnd what="boards" href="/boards" />
        ) : (
          <EmptyState icon={<LayoutGrid className="size-10" />} title={t("emptyTitle")} description={t("emptyDescription")} />
        )
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((board) => (
            <BoardCard key={board.id} board={board} role={roles.get(board.id)} />
          ))}
        </ul>
      )}
      <Pager page={page} hasNext={hasNext} basePath="/boards" />
    </main>
  );
}
