/** Hosts allowed to invoke Server Actions besides the request's own: the public app host from BETTER_AUTH_URL. */
export function serverActionOrigins(appUrl: string | undefined): string[] {
  if (!appUrl) return [];
  try {
    return [new URL(appUrl).host];
  } catch {
    return [];
  }
}
