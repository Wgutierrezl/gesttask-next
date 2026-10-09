/** Pages that need a signed-in user. Everything else (landing, auth pages, /api/*) decides for itself. */
const PROTECTED_PREFIXES = ["/boards", "/dashboard"];

export function requiresSession(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function loginRedirectFor(pathname: string, search: string): string {
  return `/login?next=${encodeURIComponent(pathname + search)}`;
}
