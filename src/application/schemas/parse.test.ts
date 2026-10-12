import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ValidationError } from "@/domain/errors";
import { parseInput } from "./parse";

function failure(schema: z.ZodType, input: unknown): ValidationError {
  try {
    parseInput(schema, input);
  } catch (error) {
    if (error instanceof ValidationError) return error;
  }
  throw new Error("expected a ValidationError");
}

describe("parseInput reasons", () => {
  it("maps default string messages to a generic reason with its bound", () => {
    const small = failure(z.object({ title: z.string().min(1) }), { title: "" });
    expect(small.fieldErrors).toEqual({ title: ["Too small: expected string to have >=1 characters"] });
    expect(small.fieldReasons).toEqual({ title: [{ reason: "tooSmall", params: { min: 1 } }] });
    const big = failure(z.object({ title: z.string().max(3) }), { title: "abcd" });
    expect(big.fieldReasons).toEqual({ title: [{ reason: "tooBig", params: { max: 3 } }] });
  });

  it("scopes a reason to its field when the schema wrote its own message", () => {
    const custom = failure(z.object({ name: z.string().min(1, "Name is required").max(5, "Too long") }), { name: "" });
    expect(custom.fieldErrors).toEqual({ name: ["Name is required"] });
    expect(custom.fieldReasons).toEqual({ name: [{ reason: "name.tooSmall", params: { min: 1 } }] });
    expect(failure(z.object({ name: z.string().max(5, "Too long") }), { name: "abcdefg" }).fieldReasons).toEqual({ name: [{ reason: "name.tooBig", params: { max: 5 } }] });
  });

  it("names the email format and an invalid enum value", () => {
    expect(failure(z.object({ email: z.email() }), { email: "x" }).fieldReasons).toEqual({ email: [{ reason: "invalidEmail" }] });
    expect(failure(z.object({ kind: z.enum(["a"], { error: "Not allowed" }) }), { kind: "b" }).fieldReasons).toEqual({ kind: [{ reason: "kind.invalid" }] });
  });

  it("gives no reason where the English message is the only truthful text", () => {
    const numeric = failure(z.object({ limit: z.number().min(1) }), { limit: 0 });
    expect(numeric.fieldErrors.limit).toHaveLength(1);
    expect(numeric.fieldReasons).toEqual({});
    expect(failure(z.object({ id: z.uuid() }), { id: "x" }).fieldReasons).toEqual({});
  });

  it("keeps the reasons aligned with the messages of a field that failed twice", () => {
    const both = failure(z.object({ code: z.string().min(3).regex(/^\d+$/) }), { code: "a" });
    expect(both.fieldErrors.code).toHaveLength(2);
    expect(both.fieldReasons).toEqual({ code: [{ reason: "tooSmall", params: { min: 3 } }, null] });
  });
});
