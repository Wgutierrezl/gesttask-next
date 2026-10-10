import { loadPage } from "@/app/_shared/load-page";
import { pageWindow, parsePage, slicePage } from "@/app/_shared/pagination";
import { requirePageActor } from "@/app/_shared/require-page-actor";
import { BoardHeader } from "@/components/boards/board-header";
import { CreatePipelineForm } from "@/components/boards/create-pipeline-form";
import { MembersPanel } from "@/components/boards/members-panel";
import { PipelineList } from "@/components/boards/pipeline-list";
import { Pager, hrefFor } from "@/components/boards/pager";
import { getContainer } from "@/infrastructure/container";

export const metadata = { title: "Board - GestTask" };

interface BoardPageProps {
  params: Promise<{ boardId: string }>;
  searchParams: Promise<{ membersPage?: string | string[]; pipelinesPage?: string | string[] }>;
}

export default async function BoardPage({ params, searchParams }: BoardPageProps) {
  await requirePageActor();
  const { boardId } = await params;
  const query = await searchParams;
  const [membersPage, pipelinesPage] = [parsePage(query.membersPage), parsePage(query.pipelinesPage)];
  const { board, role, members, pipelines } = await loadPage(async () => {
    const { getBoard, listMemberProfiles, listPipelines } = getContainer().useCases;
    // `getBoard` goes first: it is the authorization check, and a foreign board must not trigger the other reads.
    const detail = await getBoard({ boardId });
    const [members, pipelines] = await Promise.all([
      listMemberProfiles({ boardId, ...pageWindow(membersPage) }),
      listPipelines({ boardId, ...pageWindow(pipelinesPage) }),
    ]);
    return { ...detail, members: slicePage(members), pipelines: slicePage(pipelines) };
  });
  const base = `/boards/${board.id}`;
  // Each list pages on its own parameter and keeps the other list where it is.
  const keep = (name: string, page: number) => (page > 1 ? { [name]: String(page) } : {});
  const membersLink = { basePath: base, param: "membersPage", preserve: keep("pipelinesPage", pipelinesPage) };
  const pipelinesLink = { basePath: base, param: "pipelinesPage", preserve: keep("membersPage", membersPage) };
  return (
    <main className="flex flex-col gap-8">
      <BoardHeader board={board} role={role} />
      <section aria-labelledby="pipelines-heading">
        <h2 id="pipelines-heading" className="mb-3 text-lg font-medium">Pipelines</h2>
        <PipelineList pipelines={pipelines.items} pastTheEndHref={pipelinesPage > 1 ? hrefFor(pipelinesLink, 1) : undefined} />
        <Pager page={pipelinesPage} hasNext={pipelines.hasNext} {...pipelinesLink} />
      </section>
      {role === "owner" ? (
        <section aria-labelledby="new-pipeline-heading">
          <h2 id="new-pipeline-heading" className="mb-3 text-lg font-medium">Create pipeline</h2>
          <CreatePipelineForm boardId={board.id} />
        </section>
      ) : null}
      <MembersPanel members={members.items} pastTheEndHref={membersPage > 1 ? hrefFor(membersLink, 1) : undefined} />
      <Pager page={membersPage} hasNext={members.hasNext} {...membersLink} />
    </main>
  );
}
