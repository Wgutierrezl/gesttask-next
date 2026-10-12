import { ArrowLeft, Boxes, Sparkles, Workflow } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";

/**
 * The top of a pipeline page: a way back, the pipeline (violet icon, name, Pipeline badge) and the board it lives in with its
 * description. The back link reads "Back" and is named "Back to board" for assistive tech, so the visible word is part of its name.
 */
export function PipelineHeader({ boardId, boardName, name, description }: { boardId: string; boardName: string; name: string; description: string }) {
  const t = useTranslations("kanban.page");
  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-border pb-4">
      <nav aria-label={t("breadcrumb")}>
        <Link href={`/boards/${boardId}`} aria-label={t("back")} className="flex items-center gap-2 rounded-xl px-3 py-2 text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-ring">
          <ArrowLeft aria-hidden="true" className="size-5" />
          <span className="text-sm">{t("backShort")}</span>
        </Link>
      </nav>
      <div aria-hidden="true" className="hidden h-8 w-px bg-border sm:block" />
      <div className="flex min-w-0 items-center gap-3">
        <div aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-violet-gradient shadow-violet">
          <Workflow className="size-6 text-white" />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="min-w-0 truncate text-lg font-medium text-fg">{name}</h1>
            <span className="rounded-lg border border-tint-violet-fg/25 bg-tint-violet-from px-2 py-0.5 text-xs text-tint-violet-fg">{t("pipelineBadge")}</span>
          </div>
          <p className="flex items-center gap-1 text-xs text-fg-subtle">
            <Boxes aria-hidden="true" className="size-3 shrink-0" />
            <span className="min-w-0 truncate">{description ? t("subtitle", { board: boardName, description }) : boardName}</span>
          </p>
        </div>
      </div>
    </header>
  );
}

/** The title of the board section and one line on what can be done there. */
export function StagesIntro({ canMove }: { canMove: boolean }) {
  const t = useTranslations("kanban.page");
  return (
    <div className="pt-2">
      <div className="mb-2 flex items-center gap-3">
        <Sparkles aria-hidden="true" className="size-5 text-tint-violet-fg" />
        <h2 className="text-xl text-fg">{t("stagesTitle")}</h2>
      </div>
      <p className="text-sm text-fg-muted">{canMove ? t("stagesHelp") : t("stagesReadOnly")}</p>
    </div>
  );
}
