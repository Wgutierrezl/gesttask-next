/** What the web layer knows about an unauthenticated caller: an opaque, already-hashed client key for rate limits. */
export interface AnonymousCaller {
  clientKey: string;
}
