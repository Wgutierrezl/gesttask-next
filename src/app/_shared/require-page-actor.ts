import { redirect } from "next/navigation";
import type { Actor } from "@/application/actor";
import { getContainer } from "@/infrastructure/container";

/**
 * The gate for every page and data loader under `(app)`. A layout is not enough: Next renders pages and
 * Server Components independently of their layout, so each one validates the session itself.
 */
export async function requirePageActor(): Promise<Actor> {
  const actor = await getContainer().session.getActor();
  if (!actor) redirect("/login");
  return actor;
}
