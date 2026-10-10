import { describe, expect, it } from "vitest";
import { ForbiddenError, ValidationError } from "@/application/errors";
import { HttpRequestError } from "@/app/_shared/http-errors";
import { assertSameOrigin, readJsonBody } from "@/app/api/v1/_lib/request-guard";

const request = (method: string, headers: Record<string, string> = {}, body?: string) =>
  new Request("https://app.example.com/api/v1/boards", { method, headers, body });

const none = { origins: [] as string[], forwardedProto: false };

describe("assertSameOrigin (CSRF guard for cookie-authenticated mutations)", () => {
  it.each(["GET", "HEAD"])("never blocks %s: it does not change state", (method) => {
    expect(() => assertSameOrigin(request(method, { origin: "https://evil.example" }), none)).not.toThrow();
  });

  it.each(["POST", "PUT", "PATCH", "DELETE"])("refuses a cross-origin %s", (method) => {
    expect(() => assertSameOrigin(request(method, { origin: "https://evil.example" }), none)).toThrow(ForbiddenError);
  });

  it("accepts the app's own origin, and a trusted public host behind a proxy", () => {
    expect(() => assertSameOrigin(request("POST", { origin: "https://app.example.com" }), none)).not.toThrow();
    expect(() => assertSameOrigin(request("POST", { origin: "https://public.example.org" }), { origins: ["https://public.example.org"], forwardedProto: false })).not.toThrow();
  });

  it("compares the scheme too: an http page on the same host is not the https app", () => {
    const secure = (headers: Record<string, string>) => new Request("https://app.example.com/api/v1/boards", { method: "POST", headers });
    expect(() => assertSameOrigin(secure({ origin: "http://app.example.com" }), none)).toThrow(ForbiddenError);
    expect(() => assertSameOrigin(secure({ origin: "https://app.example.com" }), none)).not.toThrow();
    expect(() => assertSameOrigin(request("POST", { origin: "http://app.example.com" }), none)).toThrow(ForbiddenError); // app is https
    expect(() => assertSameOrigin(request("POST", { origin: "http://public.example.org" }), { origins: ["https://public.example.org"], forwardedProto: false })).toThrow(ForbiddenError);
  });

  it("takes the scheme from x-forwarded-proto only when a trusted proxy sets it", () => {
    const behindProxy = (headers: Record<string, string>) => new Request("http://app.example.com/api/v1/boards", { method: "POST", headers });
    const headers = { origin: "https://app.example.com", "x-forwarded-proto": "https" };
    expect(() => assertSameOrigin(behindProxy(headers), { origins: [], forwardedProto: true })).not.toThrow();
    expect(() => assertSameOrigin(behindProxy(headers), none)).toThrow(ForbiddenError); // header not trusted: the app sees http
    expect(() => assertSameOrigin(behindProxy({ origin: "https://app.example.com" }), { origins: [], forwardedProto: true })).toThrow(ForbiddenError); // no header: http
    expect(() => assertSameOrigin(behindProxy({ origin: "http://app.example.com", "x-forwarded-proto": "https" }), { origins: [], forwardedProto: true })).toThrow(ForbiddenError);
  });

  it("refuses an opaque origin and unparsable origins", () => {
    expect(() => assertSameOrigin(request("POST", { origin: "null" }), none)).toThrow(ForbiddenError);
    expect(() => assertSameOrigin(request("POST", { origin: "not a url" }), none)).toThrow(ForbiddenError);
  });

  it("trusts the browser's own Sec-Fetch-Site: cross-site and same-site (a sibling subdomain) are refused", () => {
    expect(() => assertSameOrigin(request("POST", { "sec-fetch-site": "cross-site" }), none)).toThrow(ForbiddenError);
    expect(() => assertSameOrigin(request("POST", { "sec-fetch-site": "same-site" }), none)).toThrow(ForbiddenError);
    expect(() => assertSameOrigin(request("POST", { "sec-fetch-site": "same-origin" }), none)).not.toThrow();
    expect(() => assertSameOrigin(request("POST", { "sec-fetch-site": "none" }), none)).not.toThrow();
  });

  it("lets through clients that send neither header (curl, server-to-server): no browser, no CSRF", () => {
    expect(() => assertSameOrigin(request("POST"), none)).not.toThrow();
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

  it.each(["{broken", "[1,2]", '"text"', "null", "42"])("refuses %s as a bad request: the body must be a JSON object", async (body) => {
    const error = await readJsonBody(request("POST", json, body)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpRequestError);
    expect(error).toMatchObject({ status: 400, code: "BAD_REQUEST", message: expect.stringMatching(/JSON object/) });
  });

  it("refuses a body over the size limit before parsing it", async () => {
    const big = JSON.stringify({ text: "x".repeat(70_000) });
    await expect(readJsonBody(request("POST", json, big))).rejects.toMatchObject({ status: 413, code: "PAYLOAD_TOO_LARGE", message: expect.stringMatching(/too large/i) });
  });

  it("refuses a declared length over the limit without reading the body", async () => {
    const declared = request("POST", { ...json, "content-length": "999999" }, "{}");
    await expect(readJsonBody(declared)).rejects.toMatchObject({ status: 413, code: "PAYLOAD_TOO_LARGE" });
  });
});
