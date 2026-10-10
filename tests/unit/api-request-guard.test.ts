import { describe, expect, it } from "vitest";
import { ForbiddenError, ValidationError } from "@/application/errors";
import { assertSameOrigin, readJsonBody } from "@/app/api/v1/_lib/request-guard";

const request = (method: string, headers: Record<string, string> = {}, body?: string) =>
  new Request("https://app.example.com/api/v1/boards", { method, headers, body });

describe("assertSameOrigin (CSRF guard for cookie-authenticated mutations)", () => {
  it.each(["GET", "HEAD"])("never blocks %s: it does not change state", (method) => {
    expect(() => assertSameOrigin(request(method, { origin: "https://evil.example" }), [])).not.toThrow();
  });

  it.each(["POST", "PUT", "PATCH", "DELETE"])("refuses a cross-origin %s", (method) => {
    expect(() => assertSameOrigin(request(method, { origin: "https://evil.example" }), [])).toThrow(ForbiddenError);
  });

  it("accepts the app's own origin, and a trusted public host behind a proxy", () => {
    expect(() => assertSameOrigin(request("POST", { origin: "https://app.example.com" }), [])).not.toThrow();
    expect(() => assertSameOrigin(request("POST", { origin: "https://public.example.org" }), ["public.example.org"])).not.toThrow();
  });

  it("refuses an opaque origin and unparsable origins", () => {
    expect(() => assertSameOrigin(request("POST", { origin: "null" }), [])).toThrow(ForbiddenError);
    expect(() => assertSameOrigin(request("POST", { origin: "not a url" }), [])).toThrow(ForbiddenError);
  });

  it("trusts the browser's own Sec-Fetch-Site: cross-site and same-site (a sibling subdomain) are refused", () => {
    expect(() => assertSameOrigin(request("POST", { "sec-fetch-site": "cross-site" }), [])).toThrow(ForbiddenError);
    expect(() => assertSameOrigin(request("POST", { "sec-fetch-site": "same-site" }), [])).toThrow(ForbiddenError);
    expect(() => assertSameOrigin(request("POST", { "sec-fetch-site": "same-origin" }), [])).not.toThrow();
    expect(() => assertSameOrigin(request("POST", { "sec-fetch-site": "none" }), [])).not.toThrow();
  });

  it("lets through clients that send neither header (curl, server-to-server): no browser, no CSRF", () => {
    expect(() => assertSameOrigin(request("POST"), [])).not.toThrow();
  });
});

describe("readJsonBody", () => {
  const json = { "content-type": "application/json" };

  it("returns an empty object when there is no body", async () => {
    expect(await readJsonBody(request("POST"))).toEqual({});
  });

  it("parses a JSON object", async () => {
    expect(await readJsonBody(request("POST", json, '{"name":"Roadmap"}'))).toEqual({ name: "Roadmap" });
    expect(await readJsonBody(request("POST", { "content-type": "application/json; charset=utf-8" }, "{}"))).toEqual({});
  });

  it.each([
    ["a form post", { "content-type": "application/x-www-form-urlencoded" }, "name=x"],
    ["no content type", {}, '{"a":1}'],
    ["text/plain (a no-preflight CSRF vector)", { "content-type": "text/plain" }, '{"a":1}'],
  ])("refuses %s as a validation error", async (_label, headers, body) => {
    await expect(readJsonBody(request("POST", headers, body))).rejects.toBeInstanceOf(ValidationError);
  });

  it.each(["{broken", "[1,2]", '"text"', "null", "42"])("refuses %s: the body must be a JSON object", async (body) => {
    await expect(readJsonBody(request("POST", json, body))).rejects.toMatchObject({ message: expect.stringMatching(/JSON object/) });
  });

  it("refuses a body over the size limit before parsing it", async () => {
    const big = JSON.stringify({ text: "x".repeat(70_000) });
    await expect(readJsonBody(request("POST", json, big))).rejects.toMatchObject({ message: expect.stringMatching(/too large/i) });
  });

  it("refuses a declared length over the limit without reading the body", async () => {
    const declared = request("POST", { ...json, "content-length": "999999" }, "{}");
    await expect(readJsonBody(declared)).rejects.toMatchObject({ message: expect.stringMatching(/too large/i) });
  });
});
