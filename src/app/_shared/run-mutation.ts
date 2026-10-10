import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionResult } from "@/application/result";
import { runAction } from "@/application/to-action-result";
import { getContainer } from "@/infrastructure/container";
import type { MutationState } from "./mutation-state";
import { scheduleStorageCleanup } from "./storage-cleanup";

/** A string form field; absent or file entries read as empty so validation reports them like any blank. */
export function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

/** Every string entry of a repeated field (e.g. several hidden ids); file entries are dropped. */
export function texts(form: FormData, name: string): string[] {
  return form.getAll(name).filter((value): value is string => typeof value === "string");
}

/** A string field that may be left empty, as `undefined` (an empty id would fail validation). */
export function optionalText(form: FormData, name: string): string | undefined {
  return text(form, name) || undefined;
}

/** A checkbox rendered with `value="yes"`. */
export function checked(form: FormData, name: string): boolean {
  return text(form, name) === "yes";
}

interface Options<T> {
  /** Cached pages to refresh after success; a route pattern such as `/boards/[boardId]` refreshes every page of that route. */
  revalidate?: string[];
  /** Where to go after success, or null to stay; the redirect happens outside the error handling so it is never swallowed. */
  redirectTo?: (data: T) => string | null;
  /** The mutation may have queued storage objects for deletion (REQ-CAS-02): drain them once the response is out. */
  cleanupStorage?: boolean;
}

/**
 * Runs a use case for a Server Action and keeps what it returned: typed failures come back as state, a lost session
 * goes to login. For actions the browser calls as functions (e.g. asking for an upload ticket) rather than as forms.
 */
export async function runMutationData<T>(work: () => Promise<T>, options: Options<T> = {}): Promise<ActionResult<T>> {
  const result = await runAction(work, (error) => getContainer().logger.error("action failed", { error }));
  if (!result.ok) {
    if (result.code === "UNAUTHENTICATED") redirect("/login");
    return result;
  }
  for (const path of options.revalidate ?? []) {
    if (path.includes("[")) revalidatePath(path, "page");
    else revalidatePath(path);
  }
  if (options.cleanupStorage) scheduleStorageCleanup();
  const destination = options.redirectTo?.(result.data);
  if (destination) redirect(destination);
  return result;
}

/** Runs a use case for a form-driven Server Action: success carries no data, so nothing leaks to the client. */
export async function runMutation<T>(work: () => Promise<T>, options: Options<T> = {}): Promise<MutationState> {
  const result = await runMutationData(work, options);
  return result.ok ? { ok: true, data: null } : result;
}
