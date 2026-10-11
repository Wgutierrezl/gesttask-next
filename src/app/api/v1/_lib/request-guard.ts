import { ForbiddenError, ValidationError } from "@/application/errors";
import { badRequest, payloadTooLarge } from "@/app/_shared/http-errors";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
/** Plenty for any documented body (the longest field is a 5000-character description); keeps the parser cheap. */
const MAX_BODY_BYTES = 64 * 1024;

function refuse(): never {
  throw new ForbiddenError("Cross-origin requests are not allowed");
}

export interface OriginTrust {
  /** Public origins of the app (scheme, host, port) when a proxy rewrites `Host`, e.g. from BETTER_AUTH_URL. */
  origins: readonly string[];
  /** Whether `x-forwarded-proto` comes from a proxy of ours (Vercel, or TRUSTED_PROXY_HOPS >= 1) and says which scheme the browser used. */
  forwardedProto: boolean;
}

/** The origin this request was addressed to, as the browser saw it. */
function ownOrigin(request: Request, trust: OriginTrust): string {
  const url = new URL(request.url);
  const forwarded = trust.forwardedProto ? request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase() : undefined;
  const scheme = forwarded === "http" || forwarded === "https" ? forwarded : url.protocol.slice(0, -1);
  return new URL(`${scheme}://${request.headers.get("host") ?? url.host}`).origin;
}

/**
 * CSRF guard for the session cookie (the cookie is SameSite=Lax already; this is the second wall). A browser always
 * labels a request it makes on behalf of another site, so any state change that says it is not from our own origin is
 * refused. Origins are compared whole (scheme, host and port), so a plain-http page cannot act for the https app.
 * Clients that are not browsers send neither header and are not a CSRF vector.
 */
export function assertSameOrigin(request: Request, trust: OriginTrust): void {
  if (SAFE_METHODS.has(request.method)) return;
  const site = request.headers.get("sec-fetch-site");
  if (site !== null && site !== "same-origin" && site !== "none") refuse();
  const header = request.headers.get("origin");
  if (header === null) return;
  let origin: string;
  try {
    origin = new URL(header).origin;
  } catch {
    return refuse();
  }
  if (origin === "null" || (origin !== ownOrigin(request, trust) && !trust.origins.includes(origin))) refuse();
}

const notObject = () => badRequest("The request body must be a JSON object");
const tooLarge = () => payloadTooLarge("The request body is too large");

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
