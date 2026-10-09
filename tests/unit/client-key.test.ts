import { describe, expect, it } from "vitest";
import { clientKeyFrom } from "@/infrastructure/auth/client-key";

const h = (init: Record<string, string>) => new Headers(init);

describe("clientKeyFrom", () => {
  it("is stable per client, opaque, and different across clients and secrets", () => {
    const a = clientKeyFrom(h({ "x-forwarded-for": "203.0.113.7" }), "secret-a");
    expect(a).toBe(clientKeyFrom(h({ "x-forwarded-for": "203.0.113.7" }), "secret-a"));
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(a).not.toContain("203");
    expect(a).not.toBe(clientKeyFrom(h({ "x-forwarded-for": "203.0.113.8" }), "secret-a"));
    expect(a).not.toBe(clientKeyFrom(h({ "x-forwarded-for": "203.0.113.7" }), "secret-b"));
  });

  it("uses the first forwarded address, then x-real-ip, then a shared fallback bucket", () => {
    const first = clientKeyFrom(h({ "x-forwarded-for": " 198.51.100.1 , 10.0.0.1" }), "s");
    expect(first).toBe(clientKeyFrom(h({ "x-forwarded-for": "198.51.100.1" }), "s"));
    expect(clientKeyFrom(h({ "x-real-ip": "198.51.100.1" }), "s")).toBe(first);
    expect(clientKeyFrom(h({}), "s")).toBe(clientKeyFrom(h({ "x-forwarded-for": "   " }), "s"));
  });
});
