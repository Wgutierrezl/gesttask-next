import type { z } from "zod";
import { ValidationError, type ErrorDetail, type FieldErrors, type FieldReasons } from "@/domain/errors";

/** Zod's own wording; anything else is a message the schema author wrote on purpose. */
const MIB = 1024 * 1024;
const ZOD_DEFAULT_MESSAGE = /^(Too (small|big): |Invalid )/;

/**
 * The stable reason behind one Zod issue (`validation.<reason>` in the web catalogs). A message the schema wrote itself
 * is scoped to its field (`name.tooSmall`) because its text is specific; Zod's default wording gets a generic reason,
 * and only where that wording is true to the bound (strings). Otherwise: no reason, the English message stands.
 */
function reasonOf(issue: z.core.$ZodIssue, field: string): ErrorDetail | null {
  if (field === "_") return null; // nothing to attach a field-scoped reason to: the English message stands
  const custom = !ZOD_DEFAULT_MESSAGE.test(issue.message);
  let code: string;
  let params: ErrorDetail["params"];
  if (issue.code === "too_small") [code, params] = ["tooSmall", { min: Number(issue.minimum) }];
  else if (issue.code === "too_big") [code, params] = ["tooBig", { max: Number(issue.maximum), ...(issue.origin === "number" && { maxMb: Number(issue.maximum) / MIB }) }];
  else if (issue.code === "invalid_format" && issue.format === "email") code = "invalidEmail";
  else if (issue.code === "invalid_value" && custom) code = "invalid";
  else if (issue.code === "custom" && custom) code = "custom";
  else return null;
  if (!custom && (issue.code === "too_small" || issue.code === "too_big") && issue.origin !== "string") return null;
  return { reason: custom && code !== "invalidEmail" ? `${field}.${code}` : code, ...(params && { params }) };
}

/** Validates untrusted input at the use-case boundary and speaks domain errors, not Zod's. */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const parsed = schema.safeParse(input);
  if (parsed.success) return parsed.data;
  const fieldErrors: FieldErrors = {};
  const reasons: Record<string, (ErrorDetail | null)[]> = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path.length > 0 ? issue.path.join(".") : "_";
    (fieldErrors[key] ??= []).push(issue.message);
    (reasons[key] ??= []).push(reasonOf(issue, key));
  }
  const fieldReasons: FieldReasons = Object.fromEntries(Object.entries(reasons).filter(([, list]) => list.some(Boolean)));
  throw new ValidationError("Invalid input", fieldErrors, fieldReasons);
}
