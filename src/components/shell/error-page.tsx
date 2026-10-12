import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Button, LinkButton } from "@/components/ui/button";

interface ErrorPageProps {
  /** Where "go back" leads: the landing page outside the app, the boards inside it. */
  area: "root" | "app";
  kind: "notFound" | "error";
  /** Error boundaries only: asks Next to render the segment again. */
  reset?: () => void;
}

/** The text of the app-level not-found and error pages; nothing about the failure itself is shown. */
export function ErrorPage({ area, kind, reset }: ErrorPageProps): ReactNode {
  const t = useTranslations("errorPages");
  return (
    <main className="mx-auto flex min-h-[50dvh] max-w-md flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold text-fg">{t(`${kind}.title`)}</h1>
      <p className="text-fg-muted">{t(`${kind}.body`)}</p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        {reset ? <Button onClick={reset}>{t("error.retry")}</Button> : null}
        <LinkButton href={area === "app" ? "/boards" : "/"} variant="secondary">{t(area === "app" ? "toBoards" : "toHome")}</LinkButton>
      </div>
    </main>
  );
}
