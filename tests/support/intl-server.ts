import { createFormatter, createTranslator } from "next-intl";
import en from "@/i18n/messages/en.json";

/**
 * Stand-in for `next-intl/server` in unit tests of async server components, which cannot run its request-scoped
 * helpers outside Next. Use: `vi.mock("next-intl/server", async () => (await import("@tests/support/intl-server")).intlServer)`.
 */
export const intlServer = {
  getLocale: async () => "en",
  getMessages: async () => en,
  getFormatter: async () => createFormatter({ locale: "en" }),
  getTranslations: async (namespace?: string) => createTranslator({ locale: "en", messages: en, namespace: namespace as never }),
};
