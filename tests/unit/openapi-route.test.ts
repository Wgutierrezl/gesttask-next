import { describe, expect, it } from "vitest";
import { GET, dynamic } from "@/app/api/v1/openapi.json/route";
import { buildOpenApiDocument } from "@/openapi/registry";

describe("GET /api/v1/openapi.json", () => {
  it("serves the generated document to anyone, cacheable for a few minutes", async () => {
    const response = GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/^application\/json/);
    expect(response.headers.get("cache-control")).toBe("public, max-age=300");
    expect(await response.json()).toEqual(JSON.parse(JSON.stringify(buildOpenApiDocument())));
  });

  it("is rendered once at build time: the document depends on code only, never on a request or the session", () => {
    expect(dynamic).toBe("force-static");
  });
});
