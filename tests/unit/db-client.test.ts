import { describe, expect, it } from "vitest";
import { createDb } from "@/infrastructure/db/client";
import { pgConstraint, pgErrorCode } from "@/infrastructure/db/pg-error";

const URL = "postgres://u:p@localhost:5433/db";

describe("createDb", () => {
  it.each(["pg", "neon"] as const)("builds a lazy %s pool and closes it without connecting", async (driver) => {
    const handle = createDb({ driver, url: URL });
    expect(typeof handle.db.transaction).toBe("function");
    await handle.close();
  });
});

describe("pg error helpers", () => {
  it("reads the SQLSTATE and constraint from a driver error", () => {
    const error = Object.assign(new Error("duplicate"), { code: "23505", constraint: "uq" });
    expect(pgErrorCode(error)).toBe("23505");
    expect(pgConstraint(error)).toBe("uq");
  });

  it("looks through the DrizzleQueryError wrapper (cause chain)", () => {
    const wrapped = new Error("Failed query", { cause: Object.assign(new Error("x"), { code: "40P01" }) });
    expect(pgErrorCode(wrapped)).toBe("40P01");
    expect(pgConstraint(wrapped)).toBeUndefined();
  });

  it("returns undefined for anything that is not a database error", () => {
    expect(pgErrorCode(new Error("boom"))).toBeUndefined();
    expect(pgErrorCode("text")).toBeUndefined();
    expect(pgErrorCode(null)).toBeUndefined();
  });
});
