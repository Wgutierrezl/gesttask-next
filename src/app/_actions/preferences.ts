"use server";

import { cookies, headers } from "next/headers";
import { isLocale, LOCALE_COOKIE } from "@/i18n/config";
import { isTheme, THEME_COOKIE } from "@/theme/config";

const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

/** One year, site-wide, readable by the server only: the client learns the value through the layout, never from the cookie. */
async function remember(name: string, value: string): Promise<void> {
  // From the request, not NODE_ENV: a production build served over plain HTTP (self-host) must still keep the cookie.
  const secure = (await headers()).get("x-forwarded-proto")?.split(",")[0]?.trim() === "https";
  (await cookies()).set(name, value, { path: "/", sameSite: "lax", maxAge: ONE_YEAR_SECONDS, httpOnly: true, secure });
}

/** Stores the chosen locale. Anything outside the allowlist is ignored; the action's own re-render shows the new language. */
export async function setLocaleAction(form: FormData): Promise<void> {
  const locale = form.get("locale");
  if (isLocale(locale)) await remember(LOCALE_COOKIE, locale);
}

/** Stores the chosen theme (light, dark or system). Anything outside the allowlist is ignored. */
export async function setThemeAction(form: FormData): Promise<void> {
  const theme = form.get("theme");
  if (isTheme(theme)) await remember(THEME_COOKIE, theme);
}
