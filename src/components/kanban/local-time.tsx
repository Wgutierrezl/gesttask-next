"use client";

import { useLocale } from "next-intl";
import { useSyncExternalStore } from "react";
import type { Locale } from "@/i18n/config";
import { formatInstant } from "./format";

const never = () => () => {};

/**
 * A timestamp shown in the viewer's own time zone, with the zone named. The server render, the browser's hydration
 * pass and anyone without JavaScript see UTC; once hydrated the browser switches to its own zone.
 */
export function LocalTime({ iso, label }: { iso: string; label: string }) {
  const locale = useLocale() as Locale;
  const text = useSyncExternalStore(
    never,
    () => formatInstant(iso, Intl.DateTimeFormat().resolvedOptions().timeZone, locale),
    () => formatInstant(iso, "UTC", locale),
  );
  return <time dateTime={iso}>{`${label} ${text}`}</time>;
}
