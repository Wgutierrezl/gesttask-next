import { useTranslations } from "next-intl";
import Link from "next/link";
import { Workflow } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { PastTheEnd } from "./pager";
import type { RoleName } from "./role-label";

interface PipelineView {
  id: string;
  name: string;
  description: string;
  /** Stage names in board order. */
  stages: string[];
}

/** `pastTheEndHref` is set when a later page was requested: an empty list then means the page is out of range. */
export function PipelineList({ boardId, pipelines, role, pastTheEndHref }: { boardId: string; pipelines: PipelineView[]; role: RoleName; pastTheEndHref?: string }) {
  const t = useTranslations("pipeline");
  if (pipelines.length === 0) {
    return pastTheEndHref ? (
      <PastTheEnd what="pipelines" href={pastTheEndHref} />
    ) : (
      <EmptyState as="h3" icon={<Workflow className="size-10" />} title={t("emptyTitle")} description={role === "owner" ? t("emptyOwner") : t("emptyViewer")} />
    );
  }
  return (
    <ul className="grid gap-5 md:grid-cols-2">
      {pipelines.map((pipeline) => (
        <li key={pipeline.id} className="group relative flex flex-col rounded-2xl border border-border bg-surface p-6 transition duration-[var(--duration-base)] ease-[var(--ease-out-soft)] focus-within:border-border-hover hover:border-border-hover hover:shadow-pop">
          <div aria-hidden="true" className="mb-4 flex size-12 items-center justify-center rounded-xl bg-linear-to-br from-tint-violet-from to-tint-violet-to text-tint-violet-fg">
            <Workflow className="size-6" />
          </div>
          <h3 className="mb-2 text-lg text-fg transition-colors group-hover:text-brand-link">
            <Link href={`/boards/${boardId}/pipelines/${pipeline.id}`} className="after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
              {pipeline.name}
            </Link>
          </h3>
          <p className="mb-4 line-clamp-2 min-h-10 text-sm text-fg-muted">{pipeline.description}</p>
          {pipeline.stages.length > 0 ? (
            <div className="mb-4">
              <p className="mb-2 text-xs text-fg-subtle">{t("stagesLabel")}</p>
              <ul className="flex flex-wrap gap-2">
                {pipeline.stages.map((stage, index) => (
                  <li key={index} className="rounded-lg border border-border bg-surface-hover px-2.5 py-1 text-xs text-fg-strong">{stage}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="mt-auto border-t border-border-subtle pt-4 text-sm text-fg-muted">{t("stageCount", { count: pipeline.stages.length })}</p>
        </li>
      ))}
    </ul>
  );
}
