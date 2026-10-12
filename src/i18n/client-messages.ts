/** Namespaces that stay on the server: `errors` is only read by the chokepoints that translate failures (ADR 0021). */
const SERVER_ONLY = ["errors"] as const;

/** What the root layout hands to the client provider: the catalog without its server-only namespaces. */
export function clientMessages<T extends Record<string, unknown>>(messages: T): Omit<T, (typeof SERVER_ONLY)[number]> {
  return Object.fromEntries(Object.entries(messages).filter(([namespace]) => !(SERVER_ONLY as readonly string[]).includes(namespace))) as Omit<T, (typeof SERVER_ONLY)[number]>;
}
