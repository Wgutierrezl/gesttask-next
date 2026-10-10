import { notFound, redirect } from "next/navigation";
import { runAction } from "@/application/to-action-result";
import { getContainer } from "@/infrastructure/container";

/**
 * Runs a page's data loading and turns failures into the right page outcome: missing, foreign, forbidden and malformed
 * resources all render the same 404 (nothing about existence leaks), a lost session goes to login, and
 * anything else is logged (redacted) and surfaces as a generic error for the error boundary.
 */
export async function loadPage<T>(work: () => Promise<T>): Promise<T> {
  const result = await runAction(work, (error) => getContainer().logger.error("page load failed", { error }));
  if (result.ok) return result.data;
  // A malformed id in the URL is indistinguishable from a missing resource (REQ-ISO-08).
  if (result.code === "NOT_FOUND" || result.code === "FORBIDDEN" || result.code === "VALIDATION") notFound();
  if (result.code === "UNAUTHENTICATED") redirect("/login");
  throw new Error("Something went wrong");
}
