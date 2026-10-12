import { describe, expect, it } from "vitest";
import { clientMessages } from "./client-messages";
import en from "./messages/en.json";
import es from "./messages/es.json";

describe("clientMessages", () => {
  it.each([["en", en], ["es", es]] as const)("drops the server-only errors namespace from the %s catalog and keeps the rest", (_locale, catalog) => {
    const shipped = clientMessages(catalog);
    expect(Object.keys(catalog)).toContain("errors");
    expect(shipped).not.toHaveProperty("errors");
    expect(Object.keys(shipped).sort()).toEqual(Object.keys(catalog).filter((key) => key !== "errors").sort());
    expect(shipped.auth).toBe(catalog.auth);
  });

  it("leaves a catalog without it as it was", () => {
    expect(clientMessages({ common: { a: "b" } })).toEqual({ common: { a: "b" } });
  });
});
