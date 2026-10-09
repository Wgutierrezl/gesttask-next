/** The only Better Auth endpoints reachable over HTTP; everything else goes through the use cases. */
const PUBLIC_ENDPOINTS = new Set(["GET /get-session", "POST /sign-out"]);

/**
 * Paths blocked inside Better Auth itself (defense in depth, see `createAuth`). The guard below is an
 * allowlist, so this list only has to cover the flows that have a use case with rate limits and provisioning.
 */
export const DISABLED_AUTH_PATHS = ["/sign-in/email", "/sign-up/email", "/sign-in/anonymous"];

const BASE_PATH = "/api/auth";

/**
 * Credential and guest flows must run through the use cases (schemas, rate limits, sandbox provisioning),
 * so a direct POST to `/api/auth/*` is answered 404 unless it is a known public endpoint.
 */
export function guardAuthHandler(handler: (request: Request) => Promise<Response>) {
  return async (request: Request): Promise<Response> => {
    const { pathname } = new URL(request.url);
    const path = pathname.startsWith(BASE_PATH) ? pathname.slice(BASE_PATH.length).replace(/\/$/, "") : pathname;
    if (!PUBLIC_ENDPOINTS.has(`${request.method} ${path}`)) return new Response("Not Found", { status: 404 });
    return handler(request);
  };
}
