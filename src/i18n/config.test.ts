import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, INTL_LOCALE, isLocale, LOCALES, resolveLocale } from "./config";

describe("isLocale", () => {
  it.each(["en", "es"])("accepts %s", (value) => expect(isLocale(value)).toBe(true));
  it.each(["fr", "../x", "", "EN", null, undefined, 1])("rejects %j", (value) => expect(isLocale(value)).toBe(false));
});

describe("locale tables", () => {
  it("defaults to English and maps every locale to a BCP 47 tag (en stays en-US)", () => {
    expect(DEFAULT_LOCALE).toBe("en");
    expect(LOCALES).toEqual(["en", "es"]);
    expect(INTL_LOCALE).toEqual({ en: "en-US", es: "es" });
  });
});

describe("resolveLocale", () => {
  it("prefers a valid cookie over Accept-Language", () => {
    expect(resolveLocale("es", "en")).toBe("es");
  });
  it("ignores an invalid cookie and falls through", () => {
    expect(resolveLocale("fr", "es")).toBe("es");
    expect(resolveLocale("../x", null)).toBe("en");
    expect(resolveLocale("", "en-US")).toBe("en");
  });
  it("takes the first supported primary subtag of Accept-Language", () => {
    expect(resolveLocale(undefined, "es-AR,es;q=0.9")).toBe("es");
    expect(resolveLocale(undefined, "fr-FR, es;q=0.8, en;q=0.5")).toBe("es");
  });
  it("falls back to English for unsupported or absent headers", () => {
    expect(resolveLocale(undefined, "fr")).toBe("en");
    expect(resolveLocale(undefined, null)).toBe("en");
    expect(resolveLocale(undefined, "")).toBe("en");
  });
});
