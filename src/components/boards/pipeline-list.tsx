import { PastTheEnd } from "./pager";

interface PipelineView {
  id: string;
  name: string;
  description: string;
}

/** `pastTheEndHref` is set when a later page was requested: an empty list then means the page is out of range. */
export function PipelineList({ pipelines, pastTheEndHref }: { pipelines: PipelineView[]; pastTheEndHref?: string }) {
  if (pipelines.length === 0) {
    return pastTheEndHref ? <PastTheEnd what="pipelines" href={pastTheEndHref} /> : <p className="text-sm text-gray-600">No pipelines yet.</p>;
  }
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {pipelines.map((pipeline) => (
        <li key={pipeline.id} className="rounded border border-gray-200 p-4">
          <p className="font-medium">{pipeline.name}</p>
          {pipeline.description ? <p className="mt-1 text-sm text-gray-600">{pipeline.description}</p> : null}
        </li>
      ))}
    </ul>
  );
}
