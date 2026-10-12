import { Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "./cn";

const SPARKLE_TONES = { brand: "text-icon-fg", violet: "text-tint-violet-fg" } as const;

interface PageHeroProps {
  /** The title's heading level: `h1` for a page of its own, `h2` for a section under the page's header. */
  as?: "h1" | "h2";
  title: string;
  description?: string;
  /** One quiet line under the description: a small icon and a count, like "3 active boards". */
  meta?: { icon: ReactNode; text: string };
  /** The primary action(s), pinned to the end of the row. */
  actions?: ReactNode;
  /** Id for the heading, so a section can name itself with `aria-labelledby`. */
  headingId?: string;
  tone?: keyof typeof SPARKLE_TONES;
  className?: string;
}

/** The title block of v1's pages: a sparkle, a big title, a subtitle, a meta line and the main action on the right. */
export function PageHero({ as: Heading = "h1", title, description, meta, actions, headingId, tone = "brand", className }: PageHeroProps) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-4", className)}>
      <div className="min-w-0">
        <div className="mb-3 flex items-center gap-3">
          <Sparkles aria-hidden="true" className={cn("size-6 shrink-0", SPARKLE_TONES[tone])} />
          <Heading id={headingId} className="min-w-0 break-words text-3xl text-fg">{title}</Heading>
        </div>
        {description ? <p className="text-fg-muted">{description}</p> : null}
        {meta ? (
          <p className="mt-4 flex items-center gap-2 text-sm text-fg-subtle">
            <span aria-hidden="true" className="flex [&>svg]:size-4">{meta.icon}</span>
            <span>{meta.text}</span>
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex min-w-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
