import type { AuthPort } from "../../ports/services";

export function makeSignOut(deps: { auth: AuthPort }) {
  return (): Promise<void> => deps.auth.signOut();
}
