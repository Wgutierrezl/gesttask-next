import Link from "next/link";
import { Workflow } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PastTheEnd } from "./pager";

interface PipelineView {
  id: string;
  name: string;
  description: string;
}

/** `pastTheEndHref` is set when a later page was requested: an empty list then means the page is out of range. */
export function PipelineList({ boardId, pipelines, pastTheEndHref }: { boardId: string; pipelines: PipelineView[]; pastTheEndHref?: string }) {
  if (pipelines.length === 0) {
    return pastTheEndHref ? <PastTheEnd what="pipelines" href={pastTheEndHref} /> : <p className="text-sm text-slate-600">No pipelines yet.</p>;
  }
  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {pipelines.map((pipeline) => (
        <li key={pipeline.id}>
          <Card interactive className="relative h-full">
            <div className="flex h-full flex-col gap-1 p-5">
              <Link href={`/boards/${boardId}/pipelines/${pipeline.id}`} className="flex items-center gap-2 font-semibold text-slate-900 after:absolute after:inset-0 after:rounded-card hover:text-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600">
                <Workflow aria-hidden="true" className="size-4 text-brand-600" />
                {pipeline.name}
              </Link>
              {pipeline.description ? <p className="line-clamp-2 text-sm text-slate-600">{pipeline.description}</p> : null}
            </div>
          </Card>
        </li>
      ))}
    </ul>
  );
}
