import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ClientAddressUnavailableError, clientKeyFrom, type ClientKeyOptions } from "@/infrastructure/auth/client-key";

const h = (init: Record<string, string>) => new Headers(init);
const dev: ClientKeyOptions = { vercel: false, trustedProxyHops: 0, production: false };
const vercel: ClientKeyOptions = { vercel: true, trustedProxyHops: 0, production: true };
const proxied = (hops: number): ClientKeyOptions => ({ vercel: false, trustedProxyHops: hops, production: true });

describe("clientKeyFrom", () => {
  it("is stable per client, opaque, and different across clients and secrets", () => {
    const a = clientKeyFrom(h({ "x-vercel-forwarded-for": "203.0.113.7" }), "secret-a", vercel);
    expect(a).toBe(clientKeyFrom(h({ "x-vercel-forwarded-for": "203.0.113.7" }), "secret-a", vercel));
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(a).not.toContain("203");
    expect(a).not.toBe(clientKeyFrom(h({ "x-vercel-forwarded-for": "203.0.113.8" }), "secret-a", vercel));
    expect(a).not.toBe(clientKeyFrom(h({ "x-vercel-forwarded-for": "203.0.113.7" }), "secret-b", vercel));
  });

  it("uses a domain-separated subkey, not the raw secret", () => {
    const key = clientKeyFrom(h({ "x-vercel-forwarded-for": "203.0.113.7" }), "secret-a", vercel);
    const naive = createHmac("sha256", "secret-a").update("203.0.113.7").digest("hex").slice(0, 32);
    expect(key).not.toBe(naive);
  });

  describe("on Vercel", () => {
    it("trusts x-vercel-forwarded-for, then x-real-ip, and ignores a spoofed x-forwarded-for", () => {
      const real = clientKeyFrom(h({ "x-vercel-forwarded-for": "198.51.100.1" }), "s", vercel);
      expect(clientKeyFrom(h({ "x-real-ip": "198.51.100.1" }), "s", vercel)).toBe(real);
      expect(clientKeyFrom(h({ "x-vercel-forwarded-for": "198.51.100.1", "x-forwarded-for": "1.2.3.4" }), "s", vercel)).toBe(real);
      expect(() => clientKeyFrom(h({ "x-forwarded-for": "1.2.3.4" }), "s", vercel)).toThrow(ClientAddressUnavailableError);
    });
  });

  describe("off Vercel", () => {
    it("ignores every forwarding header by default (hops = 0)", () => {
      const spoofed = h({ "x-forwarded-for": "1.2.3.4", "x-real-ip": "5.6.7.8", "x-vercel-forwarded-for": "9.9.9.9" });
      expect(clientKeyFrom(spoofed, "s", dev)).toBe(clientKeyFrom(h({}), "s", dev));
    });

    it("counts trusted hops from the right of x-forwarded-for, so client-sent prefixes cannot change the key", () => {
      const honest = clientKeyFrom(h({ "x-forwarded-for": "198.51.100.1" }), "s", proxied(1));
      expect(clientKeyFrom(h({ "x-forwarded-for": "6.6.6.6, 198.51.100.1" }), "s", proxied(1))).toBe(honest);
      expect(clientKeyFrom(h({ "x-forwarded-for": "198.51.100.1, 10.0.0.1" }), "s", proxied(2))).toBe(honest);
      expect(clientKeyFrom(h({ "x-forwarded-for": "6.6.6.6, 198.51.100.1, 10.0.0.1" }), "s", proxied(2))).toBe(honest);
    });

    it("fails closed in production when the address cannot be determined", () => {
      expect(() => clientKeyFrom(h({}), "s", proxied(1))).toThrow(ClientAddressUnavailableError);
      expect(() => clientKeyFrom(h({ "x-forwarded-for": "198.51.100.1" }), "s", proxied(2))).toThrow(/TRUSTED_PROXY_HOPS/);
      expect(() => clientKeyFrom(h({ "x-forwarded-for": "198.51.100.1" }), "s", proxied(0))).toThrow(ClientAddressUnavailableError);
    });

    it("falls back to one local bucket outside production", () => {
      expect(clientKeyFrom(h({}), "s", dev)).toMatch(/^[0-9a-f]{32}$/);
      expect(clientKeyFrom(h({}), "s", dev)).toBe(clientKeyFrom(h({ "x-forwarded-for": "   " }), "s", dev));
    });
  });
});
