import { ConflictError, NotFoundError } from "@/domain/errors";
import { pgConstraint, pgErrorCode } from "../db/pg-error";

/** Messages for the named uniques; anything else falls back to a generic conflict. */
const CONFLICT_MESSAGES: Record<string, string> = {
  board_members_board_id_user_id_pk: "User is already a member of this board",
  stages_pipeline_lower_name_uq: "A stage with this name already exists in the pipeline",
  stages_pipeline_done_uq: "The pipeline already has a done stage",
};

/**
 * Domain errors for the constraint violations the ports promise: unique violations (23505) become
 * ConflictError, a missing parent (23503, e.g. the board vanished under a concurrent delete) becomes
 * NotFoundError. Everything else is a real failure and propagates untouched.
 */
export function translateDbError(error: unknown): unknown {
  const code = pgErrorCode(error);
  if (code === "23505") return new ConflictError(CONFLICT_MESSAGES[pgConstraint(error) ?? ""] ?? "Conflict");
  if (code === "23503") return new NotFoundError();
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
