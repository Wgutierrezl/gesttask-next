import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { LOCALE_COOKIE, resolveLocale } from "./config";

/** Per-request locale (no URL routing, ADR 0021). `resolveLocale` allowlists, so the dynamic import path is safe. */
export default getRequestConfig(async () => {
  const [jar, incoming] = await Promise.all([cookies(), headers()]);
  const locale = resolveLocale(jar.get(LOCALE_COOKIE)?.value, incoming.get("accept-language"));
  return { locale, messages: (await import(`./messages/${locale}.json`)).default };
});
