import { loadPage } from "@/app/_shared/load-page";
import { requirePageActor } from "@/app/_shared/require-page-actor";
import { BoardHeader } from "@/components/boards/board-header";
import { CreatePipelineForm } from "@/components/boards/create-pipeline-form";
import { MembersPanel } from "@/components/boards/members-panel";
import { PipelineList } from "@/components/boards/pipeline-list";
import { getContainer } from "@/infrastructure/container";

export const metadata = { title: "Board - GestTask" };

export default async function BoardPage({ params }: { params: Promise<{ boardId: string }> }) {
  await requirePageActor();
  const { boardId } = await params;
  const { board, role, members, pipelines } = await loadPage(async () => {
    const { getBoard, listMemberProfiles, listPipelines } = getContainer().useCases;
    // `getBoard` goes first: it is the authorization check, and a foreign board must not trigger the other reads.
    const detail = await getBoard({ boardId });
    const [members, pipelines] = await Promise.all([listMemberProfiles({ boardId }), listPipelines({ boardId })]);
    return { ...detail, members, pipelines };
  });
  return (
    <main className="flex flex-col gap-8">
      <BoardHeader board={board} role={role} />
      <section aria-labelledby="pipelines-heading">
        <h2 id="pipelines-heading" className="mb-3 text-lg font-medium">Pipelines</h2>
        <PipelineList pipelines={pipelines} />
      </section>
      {role === "owner" ? (
        <section aria-labelledby="new-pipeline-heading">
          <h2 id="new-pipeline-heading" className="mb-3 text-lg font-medium">Create pipeline</h2>
          <CreatePipelineForm boardId={board.id} />
        </section>
      ) : null}
      <MembersPanel members={members} />
    </main>
  );
}
