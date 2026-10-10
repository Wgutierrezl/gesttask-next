import { OpenAPIRegistry, OpenApiGeneratorV31, type RouteConfig } from "@asteasolutions/zod-to-openapi";
import type { Operation } from "./operation";
import { OPERATIONS } from "./operations";
import { pageOf, errorResponse } from "./responses";

/** The name of the cookie Better Auth sets (`SessionCookieConfig.prefix` + `.session_token`); `__Secure-` is prepended over HTTPS. */
const SESSION_COOKIE = "better-auth.session_token";

type ResponseMap = RouteConfig["responses"];

const problem = (description: string) => ({ description, content: { "application/problem+json": { schema: errorResponse } } });

/** Failures a client must be ready for, derived from the shape of the operation; the codes are the ones `toHttp` produces. */
function failures(operation: Operation): ResponseMap {
  const responses: ResponseMap = { 401: problem("No valid session") };
  if (operation.method !== "get") responses[403] = problem("Your role on the board does not allow this (or the request came from another origin)");
  if (operation.params) responses[404] = problem("No such resource, or it belongs to a board you are not on: both read the same");
  if (operation.method !== "get") responses[409] = problem("The request conflicts with the current state (duplicate, last owner, stage with tasks, reused upload)");
  if (operation.body || operation.query) responses[422] = problem("Invalid input: `error.details` maps each field to its messages");
  responses[429] = problem("Too many requests: wait `Retry-After` seconds");
  if (operation.tag === "Attachments") responses[502] = problem("The file storage failed");
  responses[500] = problem("Unexpected error: quote `error.requestId` when reporting it");
  return responses;
}

function successOf(operation: Operation): ResponseMap {
  const { response } = operation;
  if (response.kind === "none") return { 204: { description: "Done; no content" } };
  const json = (schema: Parameters<typeof pageOf>[0]) => ({ "application/json": { schema } });
  if (response.kind === "item") return { [response.status]: { description: response.status === 201 ? "Created" : "OK", content: json(response.schema) } };
  return {
    200: {
      description: response.paginated ? "A page; pass `nextCursor` as `cursor` for the next one (null on the last page)" : "All items; `nextCursor` is always null",
      content: json(pageOf(response.item)),
    },
  };
}

function pathOf(operation: Operation): RouteConfig {
  return {
    method: operation.method,
    path: operation.path,
    operationId: operation.id,
    tags: [operation.tag],
    summary: operation.summary,
    security: [{ sessionCookie: [] }],
    request: {
      ...(operation.params ? { params: operation.params } : {}),
      ...(operation.query ? { query: operation.query } : {}),
      ...(operation.body ? { body: { required: true, content: { "application/json": { schema: operation.body } } } } : {}),
    },
    responses: { ...successOf(operation), ...failures(operation) },
  };
}

/**
 * The OpenAPI 3.1 document of `/api/v1`, generated from the same operation table the route handlers run, so it cannot
 * drift from what is served. Paths are relative to the `/api/v1` server.
 */
export function buildOpenApiDocument() {
  const registry = new OpenAPIRegistry();
  registry.registerComponent("securitySchemes", "sessionCookie", {
    type: "apiKey",
    in: "cookie",
    name: SESSION_COOKIE,
    description: "The session cookie set by signing in (guest or account). Browsers send it automatically; state-changing calls must come from the app's own origin.",
  });
  for (const operation of OPERATIONS) registry.registerPath(pathOf(operation));
  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: "3.1.0",
    info: {
      title: "GestTask API",
      version: "1.0.0",
      description:
        "The same use cases as the web app, over REST. Lists return `{ items, nextCursor }`. Errors return `{ error: { code, message, details?, requestId } }` as `application/problem+json`.",
    },
    servers: [{ url: "/api/v1" }],
    tags: ["Boards", "Members", "Pipelines", "Stages", "Tasks", "Comments", "Attachments"].map((name) => ({ name })),
  });
}
