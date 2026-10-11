"use client";

import { SlidersHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef } from "react";
import { cn } from "@/components/ui/cn";
import { LanguageForm } from "./language-form";
import { ThemeForm } from "./theme-form";

/**
 * Disclosure menu (`<details>`, no JavaScript needed) that gathers the visitor's preferences. Each preference is one
 * form inside the panel; add the next one next to `LanguageForm` and `ThemeForm`. `floating` pins it to the top-right of a page that
 * has no header (landing, sign-in). Closing on Escape and after a choice is a client enhancement; without JavaScript
 * the menu still opens, submits and re-renders.
 */
export function PreferencesMenu({ floating = false }: { floating?: boolean }) {
  const t = useTranslations("shell");
  const details = useRef<HTMLDetailsElement>(null);
  const close = () => {
    if (details.current) details.current.open = false;
  };
  return (
    <details
      ref={details}
      onSubmit={close}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !details.current?.open) return;
        close();
        details.current.querySelector("summary")?.focus();
      }}
      className={cn("group", floating ? "absolute right-3 top-3 z-20" : "relative")}
    >
      <summary
        aria-label={t("preferences")}
        className="flex size-9 cursor-pointer list-none items-center justify-center rounded-control border border-border-strong bg-surface text-fg-muted hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden"
      >
        <SlidersHorizontal aria-hidden="true" className="size-4" />
      </summary>
      <div className="absolute right-0 mt-2 flex w-64 flex-col gap-3 rounded-xl border border-border bg-elevated p-3 shadow-pop">
        <LanguageForm />
        <ThemeForm />
      </div>
    </details>
  );
}
