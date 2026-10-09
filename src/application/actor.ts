/** The authenticated caller as seen by use cases: never a raw token or provider object. */
export interface Actor {
  userId: string;
  isGuest: boolean;
}
