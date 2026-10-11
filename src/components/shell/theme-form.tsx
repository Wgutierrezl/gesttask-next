"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";
import { setThemeAction } from "@/app/_actions/preferences";
import { Button } from "@/components/ui/button";
import type { Theme } from "@/theme/config";
import { useTheme } from "./theme-context";

/** Like the language form, a plain form of submit buttons: it works with JavaScript disabled. */
export function ThemeForm() {
  const t = useTranslations("shell");
  const current = useTheme();
  const labelId = useId();
  const options: { theme: Theme; label: string }[] = [
    { theme: "light", label: t("themeLight") },
    { theme: "dark", label: t("themeDark") },
    { theme: "system", label: t("themeSystem") },
  ];
  return (
    <form action={setThemeAction} role="group" aria-labelledby={labelId} className="flex flex-col gap-1">
      <span id={labelId} className="px-1 text-xs font-medium uppercase tracking-wide text-fg-subtle">{t("theme")}</span>
      <div className="flex gap-1">
        {options.map(({ theme, label }) => (
          <Button
            key={theme}
            type="submit"
            name="theme"
            value={theme}
            variant={theme === current ? "primary" : "secondary"}
            size="sm"
            aria-pressed={theme === current}
            className="flex-1 px-2"
          >
            {label}
          </Button>
        ))}
      </div>
    </form>
  );
}
