"use server";

import { cookies } from "next/headers";
import { isLocale, LOCALE_COOKIE } from "@/i18n/config";

const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

/** Stores the chosen locale. Anything outside the allowlist is ignored; the action's own re-render shows the new language. */
export async function setLocaleAction(form: FormData): Promise<void> {
  const locale = form.get("locale");
  if (!isLocale(locale)) return;
  (await cookies()).set(LOCALE_COOKIE, locale, {
    path: "/",
    sameSite: "lax",
    maxAge: ONE_YEAR_SECONDS,
    httpOnly: true, // only the server reads it; the client gets the locale through the provider
    secure: process.env.NODE_ENV === "production",
  });
}
