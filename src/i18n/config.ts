/** Supported locales. Add one here, a catalog under `messages/` and an `INTL_LOCALE` entry. */
export const LOCALES = ["en", "es"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

/** BCP 47 tag handed to `Intl`; `en` maps to en-US so English output matches the pre-i18n formatting. */
export const INTL_LOCALE: Record<Locale, string> = { en: "en-US", es: "es" };

export const LOCALE_COOKIE = "locale";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** Cookie first, then the first supported primary subtag of Accept-Language, then English. Never throws. */
export function resolveLocale(cookie: string | undefined, acceptLanguage: string | null | undefined): Locale {
  if (isLocale(cookie)) return cookie;
  for (const part of (acceptLanguage ?? "").split(",")) {
    const primary = part.split(";")[0]?.trim().split("-")[0]?.toLowerCase();
    if (isLocale(primary)) return primary;
  }
  return DEFAULT_LOCALE;
}
