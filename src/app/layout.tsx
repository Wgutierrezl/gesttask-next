import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import localFont from "next/font/local";
import type { ReactNode } from "react";
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
  const [locale, messages] = await Promise.all([getLocale(), getMessages()]);
  return (
    <html lang={locale} className={geist.variable}>
      <body className="bg-slate-50 font-sans text-slate-900 antialiased">
        <NextIntlClientProvider locale={locale} messages={messages}>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
