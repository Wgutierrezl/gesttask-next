import type { UserDashboard } from "@/domain/entities/dashboard";
import type { Actor } from "../../actor";
import type { AppDeps } from "../../deps";
import { todayOf } from "./_today";

/**
 * The caller's own numbers: the boards they are on and the tasks assigned to them there (REQ-DSH-01). Deliberately takes
 * no user id, so nobody can ask for someone else's (REQ-ISO-05); nothing to authorize beyond the session. One query.
 */
export function makeGetUserDashboard(deps: AppDeps) {
  return async (actor: Actor): Promise<UserDashboard> => deps.repos.dashboard.forUser(actor.userId, todayOf(deps));
}
