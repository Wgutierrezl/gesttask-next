import type { z } from "zod";
import { ValidationError, type FieldErrors } from "@/domain/errors";

/** Validates untrusted input at the use-case boundary and speaks domain errors, not Zod's. */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const parsed = schema.safeParse(input);
  if (parsed.success) return parsed.data;
  const fieldErrors: FieldErrors = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path.length > 0 ? issue.path.join(".") : "_";
    (fieldErrors[key] ??= []).push(issue.message);
  }
  throw new ValidationError("Invalid input", fieldErrors);
}
