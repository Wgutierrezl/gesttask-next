import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { cookies } from "next/headers";
import localFont from "next/font/local";
import type { ReactNode } from "react";
import { ThemeProvider } from "@/components/shell/theme-context";
import { resolveTheme, THEME_COOKIE } from "@/theme/config";
import "./globals.css";

// Committed, not fetched from Google: builds and CI stay deterministic and offline (ADR 0020).
const geist = localFont({
  src: "./fonts/Geist-Variable.woff2",
  variable: "--font-geist",
  display: "swap",
  fallback: ["system-ui", "sans-serif"],
});

/** Pages supply the `%s` (localized, from `meta.*`); the brand suffix is added here once. */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: { default: "GestTask", template: "%s - GestTask" }, description: t("description") };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  // S16: when the server-only `errors` catalog arrives, prune `messages` by namespace here so it never reaches the client.
  const [locale, messages, jar] = await Promise.all([getLocale(), getMessages(), cookies()]);
  // Rendered by the server, so the first paint already has the right palette (no inline script, no flash). `system` is
  // resolved by the stylesheet with `prefers-color-scheme`.
  const theme = resolveTheme(jar.get(THEME_COOKIE)?.value);
  return (
    <html lang={locale} data-theme={theme} className={geist.variable}>
      <body className="bg-canvas font-sans text-fg antialiased">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ThemeProvider theme={theme}>{children}</ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
