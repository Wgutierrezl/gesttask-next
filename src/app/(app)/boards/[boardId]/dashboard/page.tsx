import Link from "next/link";
import { loadPage } from "@/app/_shared/load-page";
import { requirePageActor } from "@/app/_shared/require-page-actor";
import { CountsList } from "@/components/dashboard/counts-list";
import { PipelineStats } from "@/components/dashboard/pipeline-stats";
import { getContainer } from "@/infrastructure/container";

export const metadata = { title: "Board dashboard - GestTask" };

export default async function BoardDashboardPage({ params }: { params: Promise<{ boardId: string }> }) {
  await requirePageActor();
  const { boardId } = await params;
  const { board, dashboard } = await loadPage(async () => {
    const { getBoard, getBoardDashboard } = getContainer().useCases;
    // `getBoard` goes first: it is the authorization check, and a foreign board must not trigger the other read.
    const { board } = await getBoard({ boardId });
    return { board, dashboard: await getBoardDashboard({ boardId }) };
  });
  return (
    <main className="flex flex-col gap-6">
      <header>
        <Link href={`/boards/${board.id}`} className="text-sm underline">Back to the board</Link>
        <h1 className="mt-1 text-xl font-semibold">{board.name}</h1>
        <p className="text-sm text-gray-600">{dashboard.members} {dashboard.members === 1 ? "member" : "members"}</p>
      </header>
      <section aria-labelledby="tasks-heading" className="flex flex-col gap-3">
        <h2 id="tasks-heading" className="text-lg font-medium">Tasks on the board</h2>
        <CountsList label="Tasks on the board" counts={dashboard.tasks} />
      </section>
      <section aria-labelledby="pipelines-heading" className="flex flex-col gap-6">
        <h2 id="pipelines-heading" className="text-lg font-medium">By pipeline and stage</h2>
        {dashboard.pipelines.length === 0 ? <p className="text-sm text-gray-600">No pipelines yet, so there is nothing to count.</p> : null}
        {dashboard.pipelines.map((pipeline) => (
          <PipelineStats key={pipeline.id} pipeline={pipeline} boardId={board.id} />
        ))}
      </section>
    </main>
  );
}
