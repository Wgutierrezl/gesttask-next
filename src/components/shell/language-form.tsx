import { useId } from "react";
import { useLocale, useTranslations } from "next-intl";
import { setLocaleAction } from "@/app/_actions/preferences";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/i18n/config";

/** A plain form of submit buttons: it switches the language with JavaScript disabled too (REQ-I18N-03). */
export function LanguageForm() {
  const t = useTranslations("shell");
  const current = useLocale();
  const labelId = useId();
  const options: { locale: Locale; label: string }[] = [
    { locale: "en", label: t("languageEnglish") },
    { locale: "es", label: t("languageSpanish") },
  ];
  return (
    <form action={setLocaleAction} role="group" aria-labelledby={labelId} className="flex flex-col gap-1">
      <span id={labelId} className="px-1 text-xs font-medium uppercase tracking-wide text-fg-subtle">{t("language")}</span>
      <div className="flex gap-1">
        {options.map(({ locale, label }) => (
          <Button
            key={locale}
            type="submit"
            name="locale"
            value={locale}
            lang={locale}
            variant={locale === current ? "primary" : "secondary"}
            size="sm"
            aria-pressed={locale === current}
            className="flex-1"
          >
            {label}
          </Button>
        ))}
      </div>
    </form>
  );
}
