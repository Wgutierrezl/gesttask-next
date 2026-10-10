import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { validate } from "@scalar/openapi-parser";
import { describe, expect, it } from "vitest";
import { buildOpenApiDocument } from "@/openapi/registry";
import { OPERATIONS } from "@/openapi/operations";

const doc = buildOpenApiDocument() as unknown as {
  openapi: string;
  servers: { url: string }[];
  paths: Record<string, Record<string, { operationId: string; tags: string[]; parameters?: { name: string; in: string; required: boolean }[]; requestBody?: unknown; responses: Record<string, unknown>; security?: unknown[] }>>;
  components: { schemas: Record<string, unknown>; securitySchemes: Record<string, unknown> };
};
const routesRoot = fileURLToPath(new URL("../../src/app/api/v1/", import.meta.url));
const testsRoot = fileURLToPath(new URL("../integration/api/", import.meta.url));

/** `METHOD /path` for every handler exported by a route file under /api/v1 (the openapi.json route itself excluded). */
function servedRoutes(): string[] {
  const files = (readdirSync(routesRoot, { recursive: true }) as string[]).filter((f) => f.endsWith("route.ts") && f !== "openapi.json/route.ts");
  return files.flatMap((file) => {
    const path = "/" + file.replace(/\/?route\.ts$/, "").replace(/\[(\w+)\]/g, "{$1}");
    const source = readFileSync(routesRoot + file, "utf8");
    return ["GET", "POST", "PATCH", "DELETE"].filter((m) => new RegExp(`export const ${m}\\b`).test(source)).map((m) => `${m} ${path}`);
  });
}

describe("the OpenAPI document (REQ-API-02)", () => {
  it("is a valid OpenAPI 3.1 document", async () => {
    const result = await validate(JSON.parse(JSON.stringify(doc)));
    expect(result.errors ?? [], JSON.stringify(result.errors)).toEqual([]);
    expect(result.valid).toBe(true);
    expect(doc.openapi).toBe("3.1.0");
    expect(doc.servers).toEqual([{ url: "/api/v1" }]);
  });

  it("would notice a broken document (the validator is not vacuous)", async () => {
    const broken = await validate({ openapi: "3.1.0", info: {}, paths: { "/x": { get: { responses: "nope" } } } } as never);
    expect(broken.valid).toBe(false);
  });

  it("documents exactly the routes that are served: none missing, none invented", () => {
    const documented = Object.entries(doc.paths).flatMap(([path, methods]) => Object.keys(methods).map((m) => `${m.toUpperCase()} ${path}`));
    expect(documented.sort()).toEqual(servedRoutes().sort());
  });

  it("gives every operation its use case name as operationId, a tag, and a success response", () => {
    for (const operation of OPERATIONS) {
      const item = doc.paths[operation.path]?.[operation.method];
      expect(item?.operationId, operation.id).toBe(operation.id);
      expect(item?.tags, operation.id).toEqual([operation.tag]);
      const success = Object.keys(item!.responses).filter((status) => status.startsWith("2"));
      expect(success, operation.id).toHaveLength(1);
    }
  });

  it("describes every path parameter as required, and requires the session for each operation", () => {
    for (const operation of OPERATIONS) {
      const item = doc.paths[operation.path]![operation.method]!;
      const inPath = (item.parameters ?? []).filter((p) => p.in === "path");
      expect(inPath.map((p) => p.name).sort(), operation.id).toEqual([...operation.path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort());
      expect(inPath.every((p) => p.required), operation.id).toBe(true);
      expect(item.security, operation.id).toEqual([{ sessionCookie: [] }]);
    }
    expect(doc.components.securitySchemes.sessionCookie).toMatchObject({ type: "apiKey", in: "cookie" });
  });

  it("documents the failures a client has to handle with the uniform error body", () => {
    for (const operation of OPERATIONS) {
      const statuses = Object.keys(doc.paths[operation.path]![operation.method]!.responses);
      expect(statuses, operation.id).toEqual(expect.arrayContaining(["401", "429", "500"]));
      if (operation.method !== "get") expect(statuses, operation.id).toEqual(expect.arrayContaining(["403", "409"]));
      if (operation.params) expect(statuses, operation.id).toContain("404");
      if (operation.body || operation.query) expect(statuses, operation.id).toContain("422");
      if (operation.tag === "Attachments") expect(statuses, operation.id).toContain("502");
    }
    expect(doc.components.schemas.Error).toBeDefined();
  });

  it("shares response schemas as components instead of repeating them, and lists are wrapped in a page", () => {
    expect(Object.keys(doc.components.schemas)).toEqual(expect.arrayContaining(["Board", "Pipeline", "Stage", "Task", "Comment", "CommentView", "MemberProfile", "Error"]));
    const list = JSON.stringify(doc.paths["/boards"]!.get!.responses["200"]);
    expect(list).toContain("#/components/schemas/Board");
    expect(list).toContain("nextCursor");
  });

  it("never exposes storage keys or internal columns", () => {
    expect(JSON.stringify(doc)).not.toMatch(/storageKey|storage_key|passwordHash|secret/i);
  });

  it("has a contract test for every documented operation", () => {
    const sources = (readdirSync(testsRoot) as string[]).filter((f) => f.endsWith(".test.ts")).map((f) => readFileSync(testsRoot + f, "utf8")).join("\n");
    const untested = OPERATIONS.filter((o) => !sources.includes(`"${o.id}"`)).map((o) => o.id);
    expect(untested).toEqual([]);
  });
});
