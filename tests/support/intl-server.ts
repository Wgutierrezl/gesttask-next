import { createFormatter, createTranslator } from "next-intl";
import en from "@/i18n/messages/en.json";
import es from "@/i18n/messages/es.json";

/**
 * Stand-in for `next-intl/server` in unit tests of async server components, which cannot run its request-scoped
 * helpers outside Next. `active.locale` is read on every call, so a test can switch language.
 */
export const intlServerFor = (active: { locale: "en" | "es" }) => ({
  getLocale: async () => active.locale,
  getMessages: async () => (active.locale === "es" ? es : en),
  getFormatter: async () => createFormatter({ locale: active.locale }),
  getTranslations: async (namespace?: string) => createTranslator({ locale: active.locale, messages: active.locale === "es" ? es : en, namespace: namespace as never }),
});

/** English only. Use: `vi.mock("next-intl/server", async () => (await import("@tests/support/intl-server")).intlServer)`. */
export const intlServer = intlServerFor({ locale: "en" });
