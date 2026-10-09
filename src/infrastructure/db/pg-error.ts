interface PgErrorShape {
  code?: unknown;
  constraint?: unknown;
  cause?: unknown;
}

/** Drizzle wraps driver errors in `DrizzleQueryError`; the SQLSTATE lives on the error or its cause. */
function pgShape(error: unknown): PgErrorShape | undefined {
  for (let current = error; typeof current === "object" && current !== null; current = (current as PgErrorShape).cause) {
    if (typeof (current as PgErrorShape).code === "string") return current as PgErrorShape;
  }
  return undefined;
}

export function pgErrorCode(error: unknown): string | undefined {
  return pgShape(error)?.code as string | undefined;
}

export function pgConstraint(error: unknown): string | undefined {
  const constraint = pgShape(error)?.constraint;
  return typeof constraint === "string" ? constraint : undefined;
}
