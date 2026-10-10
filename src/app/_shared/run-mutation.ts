import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { runAction } from "@/application/to-action-result";
import { getContainer } from "@/infrastructure/container";
import type { MutationState } from "./mutation-state";

/** A string form field; absent or file entries read as empty so validation reports them like any blank. */
export function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

interface Options<T> {
  /** Cached pages to refresh after success. */
  revalidate?: string[];
  /** Where to go after success, or null to stay; the redirect happens outside the error handling so it is never swallowed. */
  redirectTo?: (data: T) => string | null;
}

/** Runs a use case for a Server Action: typed failures come back as state, a lost session goes to login. */
export async function runMutation<T>(work: () => Promise<T>, options: Options<T> = {}): Promise<MutationState> {
  const result = await runAction(work, (error) => getContainer().logger.error("action failed", { error }));
  if (!result.ok) {
    if (result.code === "UNAUTHENTICATED") redirect("/login");
    return result;
  }
  for (const path of options.revalidate ?? []) revalidatePath(path);
  const destination = options.redirectTo?.(result.data);
  if (destination) redirect(destination);
  return { ok: true, data: null };
}
