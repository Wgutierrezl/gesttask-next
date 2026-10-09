import { ConflictError, NotFoundError } from "@/domain/errors";
import { pgConstraint, pgErrorCode } from "../db/pg-error";

/**
 * Only constraints the ports promise are translated; each entry is the message for that conflict.
 * Everything else (a duplicate id, a storage-key clash, a mismatched denormalized board id...) is a bug
 * or an infrastructure fact, and must surface as itself instead of being disguised as a user error.
 */
const CONFLICTS: Record<string, string> = {
  board_members_board_id_user_id_pk: "User is already a member of this board",
  stages_pipeline_lower_name_uq: "A stage with this name already exists in the pipeline",
  stages_pipeline_done_uq: "The pipeline already has a done stage",
  // Two concurrent creates of the same board id (the idempotent demo seed relies on this one).
  boards_pkey: "Conflict",
};

/** Foreign keys whose violation means "the parent was deleted under us" (REQ: indistinguishable from missing). */
const VANISHED_PARENTS = new Set([
  "board_members_board_id_boards_id_fk",
  "pipelines_board_id_boards_id_fk",
  "stages_pipeline_board_fk",
  "tasks_pipeline_board_fk",
  "tasks_stage_pipeline_fk",
]);

/**
 * Domain errors for the constraint violations the ports promise: allowlisted unique violations (23505)
 * become ConflictError, a vanished parent (23503, e.g. the board deleted concurrently) becomes
 * NotFoundError. Every other failure propagates untouched.
 */
export function translateDbError(error: unknown): unknown {
  const code = pgErrorCode(error);
  const constraint = pgConstraint(error) ?? "";
  if (code === "23505" && Object.hasOwn(CONFLICTS, constraint)) return new ConflictError(CONFLICTS[constraint]);
  if (code === "23503" && VANISHED_PARENTS.has(constraint)) return new NotFoundError();
  return error;
}

/** Awaits a query and translates constraint violations. */
export async function exec<T>(query: PromiseLike<T>): Promise<T> {
  try {
    return await query;
  } catch (error) {
    throw translateDbError(error);
  }
}
