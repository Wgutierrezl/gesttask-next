"use client";

import { ClipboardList } from "lucide-react";
import { useParams } from "next/navigation";
import { pipelinePath } from "@/app/_shared/paths";
import { RouteModal } from "@/components/ui/route-modal";

const LABEL = "Loading task…";
const bar = "h-4 animate-pulse rounded-md bg-skeleton";

/** Shown in the modal's place while the task loads: same frame as the loaded modal, so it does not jump. */
export default function TaskModalLoading() {
  const { boardId, pipelineId } = useParams<{ boardId: string; pipelineId: string }>();
  return (
    <RouteModal title={LABEL} icon={<ClipboardList className="size-5" />} fallbackHref={pipelinePath(boardId, pipelineId)}>
      <div role="status" aria-label={LABEL} aria-busy="true" className="space-y-4">
        <div className={`${bar} w-3/4`} />
        <div className={`${bar} w-full`} />
        <div className={`${bar} w-5/6`} />
        <div className="h-24 animate-pulse rounded-xl bg-surface-muted" />
      </div>
    </RouteModal>
  );
}
