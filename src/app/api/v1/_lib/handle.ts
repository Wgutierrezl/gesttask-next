import { randomUUID } from "node:crypto";
import { NotFoundError, ValidationError } from "@/application/errors";
import { parseInput } from "@/application/schemas/parse";
import { getContainer } from "@/infrastructure/container";
import { operationById } from "@/openapi/operations";
import { decodeCursor, encodeCursor } from "@/openapi/page-query";
import { toHttp } from "@/app/_shared/to-http";
import { assertSameOrigin, readJsonBody } from "./request-guard";

type UseCase = (input: unknown) => Promise<unknown>;
interface RouteContext {
  params: Promise<Record<string, string>>;
}

const READ_METHODS = new Set(["GET", "HEAD"]);
const REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/;

/** The caller's id when it is a plain token (so it cannot inject into headers or logs), otherwise a fresh one. */
const requestIdOf = (request: Request): string => {
  const given = request.headers.get("x-request-id");
  return given !== null && REQUEST_ID.test(given) ? given : randomUUID();
};

function respond(response: Response, requestId: string): Response {
  response.headers.set("x-request-id", requestId);
  // Answers depend on the session and may carry short-lived credentials (signed upload tickets): never cached.
  response.headers.set("cache-control", "no-store");
  response.headers.set("x-content-type-options", "nosniff");
  return response;
}

/**
 * The route handler of one API operation. All it does is the HTTP part: guard the request, gather the input from the path,
 * query and body, call the SAME use case the Server Actions call (already bound to the session), and translate the outcome.
 * No business rule lives here (REQ-API-01).
 */
export function handle(operationId: string) {
  const operation = operationById(operationId);
  return async (request: Request, context: RouteContext): Promise<Response> => {
    const requestId = requestIdOf(request);
    try {
      const container = getContainer();
      const reading = READ_METHODS.has(request.method);
      assertSameOrigin(request, container.api.trustedHosts);
      await container.api.limit(reading ? "read" : "write");

      // A malformed id names no resource: same answer as a missing or foreign one (REQ-ISO-08).
      const params = operation.params ? parseParams(operation.params, await context.params) : {};
      const { cursor, ...query }: Record<string, unknown> = operation.query
        ? parseInput(operation.query, Object.fromEntries(new URL(request.url).searchParams))
        : {};
      // The use case validates the body (one schema, one set of messages); here it only has to be a JSON object.
      const body = operation.body ? await readJsonBody(request) : {};
      const paginated = operation.response.kind === "list" && operation.response.paginated;
      const offset = paginated ? offsetOf(cursor) : 0;
      const input = { ...query, ...(paginated ? { offset } : {}), ...body, ...params };

      const result = await (container.useCases as unknown as Record<string, UseCase>)[operation.id]!(input);
      return respond(success(operation.response, result, paginated ? { limit: query.limit as number, offset } : null), requestId);
    } catch (error) {
      const response = toHttp(error, requestId);
      if (response.status === 500) logUnexpected(error, requestId, operation.id);
      return respond(response.toResponse(), requestId);
    }
  };
}

function parseParams(schema: NonNullable<ReturnType<typeof operationById>["params"]>, raw: Record<string, string>) {
  try {
    return parseInput(schema, raw);
  } catch {
    throw new NotFoundError();
  }
}

function offsetOf(cursor: unknown): number {
  if (cursor === undefined) return 0;
  const offset = typeof cursor === "string" ? decodeCursor(cursor) : null;
  if (offset === null) throw new ValidationError("Invalid input", { cursor: ["Invalid cursor"] });
  return offset;
}

function success(response: ReturnType<typeof operationById>["response"], result: unknown, page: { limit: number; offset: number } | null): Response {
  if (response.kind === "none") return new Response(null, { status: 204 });
  if (response.kind === "item") return Response.json(result, { status: response.status });
  const items = result as unknown[];
  const nextCursor = page !== null && items.length >= page.limit ? encodeCursor(page.offset + page.limit) : null;
  return Response.json({ items, nextCursor });
}

function logUnexpected(error: unknown, requestId: string, operation: string): void {
  try {
    getContainer().logger.error("api request failed", { error, requestId, operation });
  } catch {
    // The container itself failed to build (bad environment): nothing left to log with.
  }
}
