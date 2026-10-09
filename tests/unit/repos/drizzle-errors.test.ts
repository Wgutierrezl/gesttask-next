import { describe, expect, it } from "vitest";
import { ConflictError, NotFoundError } from "@/domain/errors";
import { exec, translateDbError } from "@/infrastructure/repos/drizzle-errors";

const pgError = (code: string, constraint?: string) => new Error("db", { cause: { code, constraint } });

describe("translateDbError", () => {
  it.each([
    ["board_members_board_id_user_id_pk", "User is already a member of this board"],
    ["stages_pipeline_lower_name_uq", "A stage with this name already exists in the pipeline"],
    ["stages_pipeline_done_uq", "The pipeline already has a done stage"],
    ["some_other_uq", "Conflict"],
  ])("maps unique violation %s to ConflictError", (constraint, message) => {
    const error = translateDbError(pgError("23505", constraint));
    expect(error).toBeInstanceOf(ConflictError);
    expect((error as Error).message).toBe(message);
  });

  it("maps a missing parent (foreign key violation) to NotFoundError", () => {
    expect(translateDbError(pgError("23503"))).toBeInstanceOf(NotFoundError);
  });

  it("falls back to a generic conflict when the constraint name is unknown", () => {
    expect(translateDbError(pgError("23505"))).toBeInstanceOf(ConflictError);
  });

  it("leaves unrelated failures (deadlock, timeouts, bugs) untouched", () => {
    const deadlock = pgError("40P01");
    expect(translateDbError(deadlock)).toBe(deadlock);
  });
});

describe("exec", () => {
  it("passes results through and translates rejections", async () => {
    expect(await exec(Promise.resolve(7))).toBe(7);
    await expect(exec(Promise.reject(pgError("23505")))).rejects.toBeInstanceOf(ConflictError);
  });
});
