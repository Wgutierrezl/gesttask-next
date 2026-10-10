import type { ActionFailure, ActionResult } from "@/application/result";

/** What `useActionState` holds for a mutation form: nothing yet, success, or the failure to show. Client-safe. */
export type MutationState = ActionResult<null> | undefined;

export function failureOf(state: MutationState): ActionFailure | undefined {
  return state && !state.ok ? state : undefined;
}
