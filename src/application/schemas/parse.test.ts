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

  it("names a refinement the schema wrote itself, but not one with no field to attach to", () => {
    const refined = z.object({ email: z.string().refine((value) => !value.endsWith(".invalid"), { message: "Use a real email address" }) });
    expect(failure(refined, { email: "a@b.invalid" }).fieldReasons).toEqual({ email: [{ reason: "email.custom" }] });
    const whole = z.object({ a: z.string().optional(), b: z.string().optional() }).refine((v) => !(v.a && v.b), { message: "Give one of them" });
    const pathless = failure(whole, { a: "x", b: "y" });
    expect(pathless.fieldErrors).toEqual({ _: ["Give one of them"] });
    expect(pathless.fieldReasons).toEqual({});
  });

  it("reports a numeric bound in megabytes too, so a size message can be worded for people", () => {
    const upload = z.object({ size: z.number().max(5 * 1024 * 1024, "Too heavy") });
    expect(failure(upload, { size: 6_000_000 }).fieldReasons).toEqual({ size: [{ reason: "size.tooBig", params: { max: 5 * 1024 * 1024, maxMb: 5 } }] });
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
