import { ForbiddenError, ValidationError } from "@/application/errors";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
/** Plenty for any documented body (the longest field is a 5000-character description); keeps the parser cheap. */
const MAX_BODY_BYTES = 64 * 1024;

function refuse(): never {
  throw new ForbiddenError("Cross-origin requests are not allowed");
}

/**
 * CSRF guard for the session cookie (the cookie is SameSite=Lax already; this is the second wall). A browser always
 * labels a request it makes on behalf of another site, so any state change that says it is not from our own origin is
 * refused. Clients that are not browsers send neither header and are not a CSRF vector.
 * `trustedHosts` are the public hosts of the app when a proxy rewrites `Host`.
 */
export function assertSameOrigin(request: Request, trustedHosts: readonly string[]): void {
  if (SAFE_METHODS.has(request.method)) return;
  const site = request.headers.get("sec-fetch-site");
  if (site !== null && site !== "same-origin" && site !== "none") refuse();
  const origin = request.headers.get("origin");
  if (origin === null) return;
  let host: string;
  try {
    host = new URL(origin).host;
  } catch {
    return refuse();
  }
  const own = request.headers.get("host") ?? new URL(request.url).host;
  if (host !== own && !trustedHosts.includes(host)) refuse();
}

const notObject = () => new ValidationError("The request body must be a JSON object");
const tooLarge = () => new ValidationError("The request body is too large");

/** Reads at most MAX_BODY_BYTES: a declared or actual excess is refused without buffering the rest. */
async function readText(request: Request): Promise<string> {
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) throw tooLarge();
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      throw tooLarge();
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * The body as a JSON object (empty body = `{}`). Only `application/json` is accepted: a form or `text/plain` post is what
 * a cross-site page can send without a preflight, so refusing them closes that door independently of the origin check.
 */
export async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  const text = await readText(request);
  if (text === "") return {};
  if (!/^application\/json\s*(;|$)/i.test(request.headers.get("content-type") ?? "")) {
    throw new ValidationError("The request body must be sent as application/json");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw notObject();
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw notObject();
  return parsed as Record<string, unknown>;
}
