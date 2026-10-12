import { Eye, Workflow } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { LIST_LOAD_CAP, loadCapped } from "@/app/_shared/kanban-data";
import { loadPage } from "@/app/_shared/load-page";
import { pageWindow, parsePage, slicePage } from "@/app/_shared/pagination";
import { requirePageActor } from "@/app/_shared/require-page-actor";
import { BoardHeader } from "@/components/boards/board-header";
import { CreatePipelineDialog } from "@/components/boards/create-dialogs";
import { MembersDialog } from "@/components/boards/members-dialog";
import { MembersDialogBody } from "@/components/boards/members-dialog-body";
import { PipelineList } from "@/components/boards/pipeline-list";
import { Pager, hrefFor } from "@/components/boards/pager";
import { PageHero } from "@/components/ui/page-hero";
import { getContainer } from "@/infrastructure/container";

export async function generateMetadata() {
  return { title: (await getTranslations("meta"))("board") };
}

interface BoardPageProps {
  params: Promise<{ boardId: string }>;
  searchParams: Promise<{ pipelinesPage?: string | string[] }>;
}

export default async function BoardPage({ params, searchParams }: BoardPageProps) {
  const actor = await requirePageActor();
  const t = await getTranslations("pipeline");
  const { boardId } = await params;
  const pipelinesPage = parsePage((await searchParams).pipelinesPage);
  const { board, role, members, pipelines, stagesByPipeline } = await loadPage(async () => {
    const { getBoard, listMemberProfiles, listPipelines, getBoardDashboard } = getContainer().useCases;
    // `getBoard` goes first: it is the authorization check, and a foreign board must not trigger the other reads.
    const detail = await getBoard({ boardId });
    const [members, pipelines, dashboard] = await Promise.all([
      // The members dialog shows them all, up to the cap; the settings page pages through any number.
      loadCapped((page) => listMemberProfiles({ boardId, ...page }), LIST_LOAD_CAP),
      listPipelines({ boardId, ...pageWindow(pipelinesPage) }),
      // One aggregation for the stage names of every pipeline, instead of a stage query per card.
      getBoardDashboard({ boardId }),
    ]);
    return { ...detail, members, pipelines: slicePage(pipelines), stagesByPipeline: new Map(dashboard.pipelines.map((p) => [p.id, p.stages.map((stage) => stage.name)])) };
  });
  const isOwner = role === "owner";
  const pipelinesLink = { basePath: `/boards/${board.id}`, param: "pipelinesPage" };
  return (
    <main className="flex flex-col gap-8">
      <BoardHeader board={board} role={role}>
        <MembersDialog boardName={board.name} canManage={isOwner}>
          <MembersDialogBody boardId={board.id} members={members.items} currentUserId={actor.userId} canManage={isOwner} truncated={members.truncated} />
        </MembersDialog>
      </BoardHeader>
      <section aria-labelledby="pipelines-heading" className="flex flex-col gap-8">
        <PageHero
          as="h2"
          headingId="pipelines-heading"
          title={t("heading")}
          description={t("description")}
          meta={{ icon: <Workflow />, text: t("count", { count: pipelines.items.length }) }}
          actions={
            isOwner ? (
              <CreatePipelineDialog boardId={board.id} />
            ) : (
              <span className="flex items-center gap-2 rounded-xl border border-border bg-surface-muted px-6 py-3 text-fg-muted">
                <Eye aria-hidden="true" className="size-5" />
                {t("viewOnly")}
              </span>
            )
          }
        />
        <PipelineList
          boardId={board.id}
          role={role}
          pipelines={pipelines.items.map((pipeline) => ({ id: pipeline.id, name: pipeline.name, description: pipeline.description, stages: stagesByPipeline.get(pipeline.id) ?? [] }))}
          pastTheEndHref={pipelinesPage > 1 ? hrefFor(pipelinesLink, 1) : undefined}
        />
        <Pager page={pipelinesPage} hasNext={pipelines.hasNext} {...pipelinesLink} />
      </section>
    </main>
  );
}
