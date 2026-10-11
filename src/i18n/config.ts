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

/** Cookie first, then Accept-Language by descending q (ties keep header order, q=0 is "not acceptable"), then English. Never throws. */
export function resolveLocale(cookie: string | undefined, acceptLanguage: string | null | undefined): Locale {
  if (isLocale(cookie)) return cookie;
  const ranked = (acceptLanguage ?? "")
    .split(",")
    .map((part, index) => {
      const [tag = "", ...params] = part.split(";").map((piece) => piece.trim());
      const q = Number(params.find((param) => param.startsWith("q="))?.slice(2) ?? 1);
      return { primary: tag.split("-")[0]?.toLowerCase(), q: Number.isFinite(q) ? q : 1, index };
    })
    .filter(({ primary, q }) => q > 0 && isLocale(primary))
    .sort((a, b) => b.q - a.q || a.index - b.index);
  const best = ranked[0]?.primary;
  return isLocale(best) ? best : DEFAULT_LOCALE;
}
