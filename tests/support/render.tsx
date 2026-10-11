import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement, ReactNode } from "react";
import en from "@/i18n/messages/en.json";
import es from "@/i18n/messages/es.json";

type Locale = "en" | "es";
const CATALOGS = { en, es } as const;

interface IntlOptions {
  locale?: Locale;
  messages?: typeof en;
}

/** Wraps `ui` in the same provider the root layout mounts, so components under test can call `useTranslations`. */
export function withIntl(ui: ReactNode, { locale = "en", messages = CATALOGS[locale] }: IntlOptions = {}): ReactElement {
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {ui}
    </NextIntlClientProvider>
  );
}

/** `render` from Testing Library with the intl provider; the catalogs are the real ones, so tests assert real copy. */
export function renderWithIntl(ui: ReactNode, options?: IntlOptions & Parameters<typeof render>[1]) {
  const { locale, messages, ...renderOptions } = options ?? {};
  return render(withIntl(ui, { locale, messages }), renderOptions);
}
