import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GET as page } from "@/app/api/docs/route";
import { GET as bundle } from "@/app/api/docs/scalar.js/route";

const html = async (response: Response) => response.text();

describe("GET /api/docs (Scalar API reference)", () => {
  it("renders the reference of /api/v1/openapi.json from this app, with no third-party host", async () => {
    const response = await page();
    const body = await html(response);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/^text\/html/);
    expect(body).toContain("/api/v1/openapi.json");
    expect(body).toContain('src="/api/docs/scalar.js"');
    expect(body).not.toMatch(/https?:\/\/(?!www\.w3\.org)/); // no CDN, fonts or proxy host baked into the page
    expect(body).toContain("GestTask API");
  });

  it("turns Scalar's own telemetry, fonts, agent and proxy off so the page only talks to this origin", async () => {
    const body = await html(await page());
    expect(body).toMatch(/"telemetry":\s*false/);
    expect(body).toMatch(/"withDefaultFonts":\s*false/);
    expect(body).toMatch(/"agent":\s*\{\s*"disabled":\s*true/);
    expect(body).toMatch(/"mcp":\s*\{\s*"disabled":\s*true/);
  });

  it("sends a strict Content-Security-Policy whose nonce authorizes only this page's scripts and changes on every request", async () => {
    const first = await page();
    const second = await page();
    const csp = first.headers.get("content-security-policy")!;
    const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
    expect(nonce).toMatch(/^[A-Za-z0-9+/=]{16,}$/);
    expect(csp).toContain("default-src 'none'");
    expect(csp).toMatch(/script-src 'self' 'nonce-[^']+'(;|$)/);
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-(inline|eval)'/);
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).toContain("form-action 'none'");
    const body = await html(first);
    const scripts = [...body.matchAll(/<script\b[^>]*>/g)].map((m) => m[0]);
    expect(scripts.length).toBeGreaterThan(0);
    for (const tag of scripts) expect(tag, tag).toContain(`nonce="${nonce}"`);
    expect(second.headers.get("content-security-policy")).not.toBe(csp);
  });

  it("is not cached, not framed, and does not leak the referrer", async () => {
    const response = await page();
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });
});

describe("GET /api/docs/scalar.js (self-hosted bundle)", () => {
  it("serves the pinned @scalar/api-reference standalone bundle byte for byte", async () => {
    const response = await bundle();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/javascript; charset=utf-8");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("cache-control")).toBe("public, max-age=3600");
    const expected = readFileSync("node_modules/@scalar/api-reference/dist/browser/standalone.js");
    expect(Buffer.from(await response.arrayBuffer()).equals(expected)).toBe(true);
  });
});
