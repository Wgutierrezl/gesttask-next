import { buildOpenApiDocument } from "@/openapi/registry";

export const dynamic = "force-static";

/** The API contract (REQ-API-02). Public on purpose: it describes shapes, not data, and the docs page reads it. */
export function GET(): Response {
  return Response.json(buildOpenApiDocument(), { headers: { "cache-control": "public, max-age=300" } });
}
