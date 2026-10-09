import { describe, expect, it } from "vitest";
import { ConflictError, NotFoundError } from "@/domain/errors";
import { exec, translateDbError } from "@/infrastructure/repos/drizzle-errors";

const pgError = (code: string, constraint?: string) => new Error("db", { cause: { code, constraint } });

describe("translateDbError", () => {
  it.each([
    ["board_members_board_id_user_id_pk", "User is already a member of this board"],
    ["stages_pipeline_lower_name_uq", "A stage with this name already exists in the pipeline"],
    ["stages_pipeline_done_uq", "The pipeline already has a done stage"],
    ["boards_pkey", "Conflict"],
  ])("maps the allowlisted unique violation %s to ConflictError", (constraint, message) => {
    const error = translateDbError(pgError("23505", constraint));
    expect(error).toBeInstanceOf(ConflictError);
    expect((error as Error).message).toBe(message);
  });

  it.each([
    "board_members_board_id_boards_id_fk",
    "pipelines_board_id_boards_id_fk",
    "stages_pipeline_board_fk",
    "tasks_pipeline_board_fk",
    "tasks_stage_pipeline_fk",
  ])("maps the vanished-parent violation %s to NotFoundError", (constraint) => {
    expect(translateDbError(pgError("23503", constraint))).toBeInstanceOf(NotFoundError);
  });

  it.each([
    ["23505", "attachments_storage_key_unique"],
    ["23505", "tasks_pkey"],
    ["23505", undefined],
    ["23503", "comments_task_board_fk"],
    ["23503", undefined],
  ])("rethrows a %s on a constraint outside the allowlist (%s) unchanged", (code, constraint) => {
    const original = pgError(code!, constraint);
    expect(translateDbError(original)).toBe(original);
  });

  it("leaves unrelated failures (deadlock, timeouts, bugs) untouched", () => {
    const deadlock = pgError("40P01");
    expect(translateDbError(deadlock)).toBe(deadlock);
  });
});

describe("exec", () => {
  it("passes results through and translates rejections", async () => {
    expect(await exec(Promise.resolve(7))).toBe(7);
    await expect(exec(Promise.reject(pgError("23505", "boards_pkey")))).rejects.toBeInstanceOf(ConflictError);
  });
});
