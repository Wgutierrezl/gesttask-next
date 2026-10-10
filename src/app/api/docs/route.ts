import { randomBytes } from "node:crypto";
import { ApiReference } from "@scalar/nextjs-api-reference";

export const dynamic = "force-dynamic";

/**
 * Strict policy for the docs page. Everything comes from this origin: the bundle is served by `/api/docs/scalar.js`, the
 * document by `/api/v1/openapi.json`, and "Try it" calls go to the same origin (so the session cookie applies and the
 * API's CSRF check sees a same-origin request). The nonce authorizes only this page's own scripts; Scalar needs inline
 * styles, nothing else is relaxed.
 */
const policy = (nonce: string) =>
  [
    "default-src 'none'",
    `script-src 'self' 'nonce-${nonce}'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join("; ");

/** API reference UI (Scalar) for the OpenAPI document, self-hosted and with Scalar's outbound features switched off. */
export function GET(): Response {
  const nonce = randomBytes(16).toString("base64");
  return ApiReference(
    {
      url: "/api/v1/openapi.json",
      pageTitle: "GestTask API",
      cdn: "/api/docs/scalar.js",
      nonce,
      telemetry: false,
      withDefaultFonts: false,
      agent: { disabled: true },
      mcp: { disabled: true },
      hideClientButton: true,
      persistAuth: false,
    },
    {
      headers: {
        "content-security-policy": policy(nonce),
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
        "referrer-policy": "no-referrer",
      },
    },
  )();
}
