import { INTL_LOCALE, type Locale } from "@/i18n/config";

const DATE = Object.fromEntries(
  (Object.keys(INTL_LOCALE) as Locale[]).map((locale) => [locale, new Intl.DateTimeFormat(INTL_LOCALE[locale], { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })]),
) as Record<Locale, Intl.DateTimeFormat>;

const DAY = Object.fromEntries(
  (Object.keys(INTL_LOCALE) as Locale[]).map((locale) => [locale, new Intl.DateTimeFormat(INTL_LOCALE[locale], { month: "short", day: "numeric", timeZone: "UTC" })]),
) as Record<Locale, Intl.DateTimeFormat>;

/** "Oct 9" (es: "9 oct"): the compact form for a card's chip, where the year is not worth the room. */
export function formatDay(value: string, locale: Locale, timeZone?: string): string {
  const date = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  return timeZone ? new Intl.DateTimeFormat(INTL_LOCALE[locale], { month: "short", day: "numeric", timeZone }).format(date) : DAY[locale].format(date);
}

/** "Oct 9, 2026" (es: "9 oct 2026") for a calendar date or an ISO timestamp; always in UTC so server and browser agree. */
export function formatDate(value: string, locale: Locale): string {
  return DATE[locale].format(new Date(value.length === 10 ? `${value}T00:00:00Z` : value));
}

/**
 * "Oct 9, 2026, 10:00 AM UTC": an instant with its zone spelled out. Without a zone it is UTC, so the server (which
 * does not know the viewer's zone) and the first browser render agree; the browser then passes its own.
 */
export function formatInstant(value: string, timeZone: string, locale: Locale): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone, timeZoneName: "short" }).format(new Date(value));
}
