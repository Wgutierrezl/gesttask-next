const DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** "Oct 9, 2026" for a calendar date or an ISO timestamp; always in UTC so server and browser agree. */
export function formatDate(value: string): string {
  return DATE.format(new Date(value.length === 10 ? `${value}T00:00:00Z` : value));
}

export const PRIORITY_LABELS = { low: "Low", medium: "Medium", high: "High" } as const;

/** Shown when a task has no assignee. A name that cannot be resolved is a member who has since left the board. */
export function assigneeLabel(assigneeId: string | null, name: string | null): string {
  if (assigneeId === null) return "Unassigned";
  return name ?? "Former member";
}

/**
 * "Oct 9, 2026, 10:00 AM UTC": an instant with its zone spelled out. Without a zone it is UTC, so the server (which
 * does not know the viewer's zone) and the first browser render agree; the browser then passes its own.
 */
export function formatInstant(value: string, timeZone = "UTC"): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone, timeZoneName: "short" }).format(new Date(value));
}
