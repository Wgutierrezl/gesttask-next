import type { AppDeps } from "../../deps";

/** The UTC calendar date of the server clock: the basis overdue is judged on everywhere (see `isOverdue`). */
export const todayOf = (deps: AppDeps): string => deps.clock.now().toISOString().slice(0, 10);
