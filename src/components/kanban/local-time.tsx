"use client";

import { useSyncExternalStore } from "react";
import { formatInstant } from "./format";

const never = () => () => {};

/**
 * A timestamp shown in the viewer's own time zone, with the zone named. The server render, the browser's hydration
 * pass and anyone without JavaScript see UTC; once hydrated the browser switches to its own zone.
 */
export function LocalTime({ iso, label }: { iso: string; label: string }) {
  const text = useSyncExternalStore(
    never,
    () => formatInstant(iso, Intl.DateTimeFormat().resolvedOptions().timeZone),
    () => formatInstant(iso),
  );
  return <time dateTime={iso}>{`${label} ${text}`}</time>;
}
